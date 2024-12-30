import { getDataNewProcess } from "../utils";
import {
    getAllServers,
    isPrepped,
    preFormulasThreadCalc
} from "./utils";

import { Deque } from "./Deque";
import { Job } from "./Job";
import { TargetProfile } from "./ServerProfile";
import { RAMCluster } from "./RAMCluster";

import {
    SCRIPTS,
    SECURITY_PER_GROW,
    SECURITY_PER_WEAKEN,
    TYPES,
    COSTS
} from "./constants";

const PREP_SCRIPTS = {
    weaken: "/batcher/dumb_weaken.ts",
    grow: "/batcher/dumb_grow.ts",
};

const SCRIPTS_TO_COPY = [
    PREP_SCRIPTS.weaken,
    PREP_SCRIPTS.grow,
    SCRIPTS.weaken1,
    SCRIPTS.grow,
    SCRIPTS.weaken2,
    SCRIPTS.hack,
    "/batcher/typedefs.ts",
];

/**
 * Optimizes the profile using the currently available servers.
 * @param ns 
 * @param profile Profile to optimize. IS MUTATED.
 * @param cluster RAMCluster to use. IS MUTATED (through its update method).
 * @param retryIfTimingLimited If the timing limit is reached, retry with a larger batch size.
 * @param moneyTake The proportion of money to take in a batch. Multiplied by 1.5 if timing limited for a retry.
 */
function optimizeProfile(ns: NS, profile: TargetProfile, cluster: RAMCluster, retryIfTimingLimited: number = 3, moneyTake: number = 0.01) {
    cluster.update(ns, getAllServers(ns, "home"));
    const maxThreads = Math.floor(cluster.maxBlockSize / 1.75); // max threads per thread block
    const maxMoney = profile.maxMoney;
    const weakenTime = profile.weakenTime;
    const timingLimitBatch = Math.floor(weakenTime / (4 * profile.spacer) * 0.97);  // give a little buffer for level-ups and scheduler delays
    const amountToTake = maxMoney * moneyTake;
    const { hackThreads, growThreads, weaken1Threads, weaken2Threads } = preFormulasThreadCalc(ns, profile.target, amountToTake);
    if (Math.max(hackThreads, growThreads, weaken1Threads, weaken2Threads) > maxThreads) {
        throw new Error("Cannot schedule a single batch. Things are seriously wrong.");
    }
    const threadCosts = [
        hackThreads * COSTS.hack,
        weaken1Threads * COSTS.weaken1,
        growThreads * COSTS.grow,
        weaken2Threads * COSTS.weaken2
    ];
    let ramLimitBatch = cluster.allocateBatches(ns, threadCosts);

    if (ramLimitBatch <= timingLimitBatch) {
        profile.hackRatio = moneyTake;
        profile.mode = "RAM restricted";
        profile.batches = ramLimitBatch;
        return;
    }
    if (retryIfTimingLimited > 0) {
        // Too many batches. Try to increase size of each batch.
        try {
            return optimizeProfile(ns, profile, cluster, retryIfTimingLimited - 1, moneyTake * 1.5);
        } catch (e) {
            // Batches are ridiculously large.
            // Just go with the timing limit.
        }
    }
    profile.hackRatio = moneyTake;
    profile.mode = "Timing restricted";
    profile.batches = timingLimitBatch;
}

class ContinuousBatcher {
    #ns: NS;

    #profile: TargetProfile;
    #cluster: RAMCluster;
    #target: string;
    #schedule: Deque<Job>;
    #dataPort: NetscriptPort;
    #running: Map<string, Job> = new Map();

    // #profile.batches is maximum number of batches schedulable
    // #deployedBatches is the number of batches deployed/scheduled.
    #aliveBatches: number;
    // count desyncs, but desyncing is not a big problem since the batcher is self-correcting
    #desyncs: number = 0;

    constructor(ns: NS, profile: TargetProfile, cluster: RAMCluster) {
        profile.update(ns);
        this.#ns = ns;
        this.#profile = profile;
        this.#cluster = cluster;
        this.#target = profile.target;
        this.#schedule = new Deque<Job>(Math.floor(profile.weakenTime / profile.spacer) * 4 + 100);
        this.#dataPort = ns.getPortHandle(ns.pid);

        this.#aliveBatches = 0;
    }

    scheduleBatches(batches: number, startingBatchId: number) {
        for (let i = 0; i < batches; i++) {
            let id = startingBatchId + i;
            const staging = [];
            let success = true;
            for (const type of TYPES) {
                this.#profile.end += this.#profile.spacer;
                const job = new Job(this.#ns, type, this.#profile, id);

                if (!this.#cluster.assign(job)) {
                    success = false;
                    break;
                }
                staging.push(job);
            }
            if (success) {
                for (const job of staging) {
                    this.#schedule.push(job);
                }
                this.#aliveBatches++;
            } else {
                this.#ns.print(`WARN: Failed to schedule batch ${id}.`);
                for (const job of staging) {
                    this.#cluster.free(job);
                }
            }
        }
    }

    async deploy() {
        while (this.#schedule.size > 0) {
            const job = this.#schedule.shift();
            job.end += this.#profile.delay;
            const jobPid = this.#ns.exec(
                SCRIPTS[job.type], job.server,
                { threads: job.threads, temporary: true },
                JSON.stringify(job)
            );
            if (!jobPid) {
                this.#ns.tprint(`ERROR: Failed to deploy job ${job.id}.`);
                this.#ns.tprint(JSON.stringify(job));
                this.#ns.tprint(`${job.server}: ${this.#ns.getServerUsedRam(job.server)} / ${this.#ns.getServerMaxRam(job.server)}`);
                this.#ns.tprint(JSON.stringify(this.#cluster.getBlock(job.server)));
                this.#ns.tprint(`Alive batches: ${this.#aliveBatches}`);
                this.#ns.tprint(`Profile batches: ${this.#profile.batches}`);
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
        this.scheduleBatches(this.#profile.batches, 0);
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
                    const batch = parseInt(data.slice(7));
                    this.#aliveBatches--;

                    if (batch == 0) {
                        this.#profile.end = Date.now() + this.#profile.spacer + this.#profile.weakenTime + 100; // give a little buffer
                    }

                    // If not prepped, cancel the next hack.
                    // This allows the batcher to self-recover from desyncs.
                    if (!isPrepped(this.#ns, this.#target)) {
                        const id = "hack" + (batch + 1);
                        this.#ns.print(`WARN: Desync detected. Cancelling ${id}.`);
                        const cancel = this.#running.get(id);
                        if (cancel) {
                            this.#cluster.free(cancel);
                            this.#running.delete(id);
                            this.#ns.kill(cancel.pid);
                            this.#desyncs++;
                            this.#ns.print(`INFO: Cancelled ${id}.`);
                        }
                    }

                    // schedule another batch if we're not at the limit
                    if (batch < this.#profile.batches) {
                        this.scheduleBatches(1, batch);
                        await this.deploy();
                    } else {
                        this.#ns.print(`INFO: Scaling back! ${this.#aliveBatches}/${this.#profile.batches} batches alive.`);
                    }

                    // every "full cycle" we do some more things
                    if (batch + 1 == this.#aliveBatches) {
                        // mutates profile, further batches can have different sizes
                        optimizeProfile(this.#ns, this.#profile, this.#cluster, 3);
                        this.#profile.update(this.#ns);
                        this.#ns.print(`${this.#aliveBatches}/${this.#profile.batches} batches.`);
                        this.#ns.print(`${this.#profile.toString()}`);
                        // we can schedule more batches if we're not at the limit
                        if (this.#profile.batches > this.#aliveBatches) {
                            this.scheduleBatches(this.#profile.batches - this.#aliveBatches, this.#aliveBatches);
                            await this.deploy();
                        }
                    }
                }
            }
        }
    }
}

async function targetScore(ns: NS, target: string, useFormulas: boolean = false): Promise<number> {
    if (!ns.hasRootAccess(target)) return -1;
    const player = ns.getPlayer();
    const server = ns.getServer(target);
    if (server.moneyMax === 0) return -1;
    if (server.requiredHackingSkill > player.skills.hacking) return -1;
    if (useFormulas) {
        server.hackDifficulty = server.minDifficulty;
        let weakenTime = await getDataNewProcess(ns, "ns.formulas.hacking.weakenTime(args[0], args[1]) + 20", [server, player], (f, ...args) => ns.exec(f, "home", ...args));
        let hackChance = await getDataNewProcess(ns, "ns.formulas.hacking.hackChance(args[0], args[1])", [server, player], (f, ...args) => ns.exec(f, "home", ...args));
        return server.moneyMax / weakenTime * hackChance;
    }
    if (server.requiredHackingSkill > player.skills.hacking / 2) return -1;
    let penalty = (server.moneyMax - server.moneyAvailable) / server.moneyMax * 0.2;
    return (server.moneyMax / server.minDifficulty) * (1 - penalty);
}

async function prep(ns: NS, target: string) {
    const cluster = new RAMCluster(ns, getAllServers(ns, "home"), SCRIPTS_TO_COPY);
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
    ns.disableLog('ALL');
    ns.tail();
    const dataPort = ns.getPortHandle(ns.pid);
    dataPort.clear();

    while (true) {
        const allServers = getAllServers(ns, "home");
        let bestTarget: string, bestScore = -10;
        for (const server of allServers) {
            const score = await targetScore(ns, server, true);
            if (score > bestScore) {
                bestScore = score;
                bestTarget = server;
            }
            if (!ns.scp(SCRIPTS_TO_COPY, server, "home")) {
                throw new Error(`ERROR: Failed to scp scripts to ${server}.`);
            }
        }
        const target = ns.args[0] as string || bestTarget;
        ns.print(`Target: ${target}`);

        if (!isPrepped(ns, target)) {
            await prep(ns, target);
        }

        const profile = new TargetProfile(ns, target);
        const cluster = new RAMCluster(ns, allServers, SCRIPTS_TO_COPY);

        optimizeProfile(ns, profile, cluster);
        profile.update(ns);
        ns.print(`Optimized profile: ${profile.toString()}`);

        const batcher = new ContinuousBatcher(ns, profile, cluster);
        await batcher.run();
    }
}