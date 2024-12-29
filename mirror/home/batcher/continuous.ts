import { getDataNewProcess } from "../utils";
import {
    Deque,
    getAllServers,
    isPrepped,
    Job,
    RAMCluster,
    SCRIPTS,
    ServerProfile,
    TYPES,
    SECURITY_PER_GROW,
    SECURITY_PER_WEAKEN,
    optimizeProfile
} from "./utils";

const PREP_SCRIPTS = {
    weaken: "/batcher/dumb_weaken.ts",
    grow: "/batcher/dumb_grow.ts",
};

class ContinuousBatcher {
    #ns: NS;

    #profile: ServerProfile;
    #cluster: RAMCluster;
    #target: string;
    #schedule: Deque<Job>;
    #dataPort: NetscriptPort;
    #batchCount: number = 0;
    #running: Map<string, Job> = new Map();

    // count desyncs, but desyncing is not a big problem since the batcher is self-correcting
    #desyncs: number = 0;

    constructor(ns: NS, profile: ServerProfile, cluster: RAMCluster) {
        this.#ns = ns;
        this.#profile = profile;
        this.#cluster = cluster;
        this.#target = profile.target;
        this.#schedule = new Deque<Job>(profile.batches * 4); // HWGW is 4 processes
        this.#dataPort = ns.getPortHandle(ns.pid);

        this.#profile.end = Date.now() + profile.weakenTime - profile.spacer;
    }

    async scheduleBatches(batches: number) {
        while (this.#schedule.size < batches * 4) {
            this.#batchCount++;
            for (const type of TYPES) {
                this.#profile.end += this.#profile.spacer;
                const job = new Job(this.#ns, type, this.#profile, this.#batchCount);

                if (!this.#cluster.assign(job)) {
                    this.#ns.print(`WARN: Failed to assign job ${job.type}: ${job.batch}.`);
                    continue;
                }
                this.#schedule.push(job);
            }
            await this.#ns.sleep(0);
        }
    }

    async deploy() {
        while (this.#schedule.size > 0) {
            await this.#ns.sleep(0);
            const job = this.#schedule.shift();
            job.end += this.#profile.delay;
            const jobPid = this.#ns.exec(
                SCRIPTS[job.type], job.server,
                { threads: job.threads, temporary: true },
                JSON.stringify(job)
            );
            if (!jobPid) {
                throw new Error(`ERROR: Failed to deploy job ${job.id}.`);
            }
            const tPort = this.#ns.getPortHandle(jobPid);

            job.pid = jobPid;
            await tPort.nextWrite();

            this.#profile.delay += Math.max(Math.ceil(tPort.read()) - this.#profile.spacer, 0);
            this.#running.set(job.id, job);
        }

        // After the loop, we adjust future job ends to account for the delay, then reset it.
        this.#profile.end += this.#profile.delay;
        this.#profile.delay = 0;
    }

    async run() {
        const dataPort = this.#dataPort;
        await this.scheduleBatches(this.#profile.batches);
        await this.deploy();
        this.#ns.print("Initial deployment complete.");
        while (true) {
            await dataPort.nextWrite();

            while (!dataPort.empty()) {
                // someone finished, reporting their id
                const data: string = dataPort.read();

                if (this.#running.has(data)) {
                    this.#cluster.free(this.#running.get(data));
                    this.#running.delete(data);
                } else {
                    this.#ns.tprint(`WARN: Received unknown job id ${data}.`);
                    this.#ns.print(`WARN: Received unknown job id ${data}.`);
                }

                // if it's a w2, it's the end of one batch
                if (data.startsWith("weaken2")) {
                    this.#profile.update(this.#ns);

                    // If not prepped, cancel a hack.
                    // This allows the batcher to self-recover from desyncs.
                    if (!isPrepped(this.#ns, this.#target)) {
                        const id = "hack" + (parseInt(data.slice(7)) + 1);
                        const cancel = this.#running.get(id);
                        if (cancel) {
                            this.#ns.print(`WARN: Desync detected. Cancelling ${id}.`);
                            this.#cluster.free(cancel);
                            this.#running.delete(id);
                            this.#ns.kill(cancel.pid);
                            this.#desyncs++;
                        }
                    }

                    // schedule another batch
                    await this.scheduleBatches(1);
                    await this.deploy();
                }
            }
        }
    }
}

async function targetScore(ns: NS, target: string, useFormulas: boolean = false): Promise<number> {
    if (!ns.hasRootAccess(target)) return -1;
    const player = ns.getPlayer();
    const server = ns.getServer(target);
    if (server.requiredHackingSkill > player.skills.hacking) return -1;
    if (useFormulas) {
        server.hackDifficulty = server.minDifficulty;
        let weakenTime = await getDataNewProcess(ns, "ns.formulas.hacking.weakenTime(args[0], args[1])", [server, player], (f, ...args) => ns.exec(f, "home", ...args));
        let hackChance = await getDataNewProcess(ns, "ns.formulas.hacking.hackChance(args[0], args[1])", [server, player], (f, ...args) => ns.exec(f, "home", ...args));
        return server.moneyMax / weakenTime * hackChance;
    }
    if (server.requiredHackingSkill > player.skills.hacking / 2) return -1;
    let penalty = (server.moneyMax - server.moneyAvailable) / server.moneyMax * 0.8;
    return (server.moneyMax / server.minDifficulty) * (1 - penalty);
}

async function prep(ns: NS, target: string) {
    const cluster = new RAMCluster(ns, getAllServers(ns, "home"));
    const EPSILON = 0.0001;
    const maxMoney = ns.getServerMaxMoney(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);

    let money = ns.getServerMoneyAvailable(target);
    let security = ns.getServerSecurityLevel(target);

    // basically protobatch until we're ready
    while (!isPrepped(ns, target)) {
        await ns.sleep(0);
        const blocks = cluster.getBlocksClone();
        const buckets = blocks.map((block) => {
            return { server: block.server, threads: Math.floor(block.ram / 1.75) };
        });
        const totalThreads = buckets.reduce((a, b) => a + b.threads, 0);
        const weakenTime = ns.getWeakenTime(target);

        security = ns.getServerSecurityLevel(target);

        if (security > minSecurity + EPSILON) {
            ns.print(`Scheduling all threads to weaken ${target}.`);
            for (const bucket of buckets) {
                if (bucket.threads <= 0) continue;
                const pid = ns.exec(PREP_SCRIPTS.weaken, bucket.server, bucket.threads, target);
                if (!pid) {
                    throw new Error(`ERROR: Failed to exec weaken on ${bucket.server}.`);
                }
            }
            await ns.sleep(weakenTime + 200);
            continue;
        }

        // server is at min security, grow until we're ready
        money = ns.getServerMoneyAvailable(target);
        if (money >= maxMoney) {
            return;
        }
        // schedule grows & weaken
        let weakenThreads = Math.ceil(totalThreads * SECURITY_PER_GROW / (SECURITY_PER_WEAKEN + SECURITY_PER_GROW));
        let growThreads = totalThreads - weakenThreads;
        ns.print(`Scheduling ${growThreads} threads to grow and ${weakenThreads} threads to weaken ${target}.`);
        for (const bucket of buckets) {
            let availableThreads = bucket.threads;
            const weak = Math.min(weakenThreads, availableThreads);
            weakenThreads -= weak;
            availableThreads -= weak;
            const grow = Math.min(growThreads, availableThreads);
            growThreads -= grow;
            availableThreads -= grow;

            if (weak > 0) {
                const pid = ns.exec(PREP_SCRIPTS.weaken, bucket.server, weak, target);
                if (!pid) {
                    throw new Error(`ERROR: Failed to exec weaken on ${bucket.server}.`);
                }
            }
            if (grow > 0) {
                const pid = ns.exec(PREP_SCRIPTS.grow, bucket.server, grow, target);
                if (!pid) {
                    throw new Error(`ERROR: Failed to exec grow on ${bucket.server}.`);
                }
            }
        }
        await ns.sleep(weakenTime + 200);
    }
}


export async function main(ns: NS) {
    const scripts_to_copy = [
        PREP_SCRIPTS.weaken,
        PREP_SCRIPTS.grow,
        SCRIPTS.weaken1,
        SCRIPTS.grow,
        SCRIPTS.weaken2,
        SCRIPTS.hack,
    ];
    ns.disableLog('ALL');
    ns.tail();
    const dataPort = ns.getPortHandle(ns.pid);
    dataPort.clear();

    while (true) {
        const allServers = getAllServers(ns, "home");
        ns.print(allServers);
        let bestTarget: string, bestScore = -10;
        for (const server of allServers) {
            const score = await targetScore(ns, server, true);
            if (score > bestScore) {
                bestScore = score;
                bestTarget = server;
            }
            if (!ns.scp(scripts_to_copy, server, "home")) {
                throw new Error(`ERROR: Failed to scp scripts to ${server}.`);
            }
        }
        const target = ns.args[0] as string || bestTarget;
        ns.print(`Target: ${target}`);

        if (!isPrepped(ns, target)) {
            await prep(ns, target);
        }

        const profile = new ServerProfile(ns, target);
        const cluster = new RAMCluster(ns, allServers);

        ns.print("Optimizing. May take a while.");
        await optimizeProfile(ns, profile, cluster);
        profile.update(ns);

        const batcher = new ContinuousBatcher(ns, profile, cluster);
        await batcher.run();
    }
}