import { getAllServers } from "./utils";
import { prepServer } from "./prepper";
import { RamNet } from "./RamNet";

const SLEEP_SLACK_TIME = 2000; // fuck me.
const MAX_BATCHES = 50000;
const GROW_COMPENSATION = 1.01; // heath robinson growth compensation


function getOptimalTarget(ns: NS) {
    const hackLevel = ns.getHackingLevel();
    function getScore(server: Server) {
        const difficultyScale = (100 - server.minDifficulty) / (100 - server.hackDifficulty);
        const hackChanceAdjusted = Math.min(1,
            ns.hackAnalyzeChance(server.hostname) * difficultyScale
        );
        const hackPercentAdjusted = Math.min(1,
            ns.hackAnalyze(server.hostname) * difficultyScale
        );
        const timePenalty = (200 + server.requiredHackingSkill * server.minDifficulty) / (50 + hackLevel);
        const baseScore = server.moneyMax * hackChanceAdjusted * hackPercentAdjusted / timePenalty;

        if (server.hackDifficulty == server.minDifficulty && server.moneyAvailable >= 0.9 * server.moneyMax) {
            return baseScore * 2;
        }
        return baseScore;
    }
    if (hackLevel < 250) {
        // good xp ratio, good growth, earlygame king
        return "joesguns";
    }

    const servers = getAllServers(ns, "home").map(ns.getServer).filter(s => s.moneyMax && s.hasAdminRights);
    const bestServer = servers.reduce((acc, server) => {
        const { server: best, score: bscore } = acc;
        const score = getScore(server);
        return score > bscore ? { server, score } : acc;
    }, { server: servers[0], score: getScore(servers[0]) });
    return bestServer.server.hostname;
}

function launchHack(ns: NS, target: string, threads: number, ramNet: RamNet, dryRun: boolean) {
    const SCRIPT = (threads == 0.5 ? "/batcher/shotgun_hack_half.js" : "/batcher/shotgun_hack.js");
    if (threads == 0.5) {
        threads = 1;
    }
    const block = ramNet.blocks.find(b => b.ram >= threads * 1.70);
    if (!block) {
        return 0;
    }
    block.ram -= threads * 1.70;
    if (dryRun) {
        return 1;
    }
    return ns.exec(SCRIPT, block.name, threads, target, ns.getWeakenTime(target) - ns.getHackTime(target));
};

function launchGrow(ns: NS, target: string, threads: number, ramNet: RamNet, dryRun: boolean) {
    const SCRIPT = "/batcher/shotgun_grow.js";
    const block = ramNet.blocks.find(b => b.ram >= threads * 1.75);
    if (!block) {
        return 0;
    }
    block.ram -= threads * 1.75;
    if (dryRun) {
        return 1;
    }
    return ns.exec(SCRIPT, block.name, threads, target, ns.getWeakenTime(target) - ns.getGrowTime(target));
};

/**
 * Weaken can be split without any penalty. This does not return a PID because it may launch multiple processes.
 */
function launchWeaken(ns: NS, target: string, threads: number, ramNet: RamNet, dryRun: boolean) {
    while (threads > 0) {
        const block = ramNet.blocks.find(b => b.ram >= threads * 1.75);
        if (!block) {
            return 0;
        }
        const actualThreads = Math.min(threads, Math.floor(block.ram / 1.75));
        if (!dryRun) {
            if (!ns.exec("/batcher/shotgun_weaken.js", block.name, actualThreads, target)) {
                ns.print(`WARN: Failed to spread launch weaken on ${block.name}`);
                return 0;
            }
        }
        block.ram -= actualThreads * 1.75;
        threads -= actualThreads;
    }
    return -1; // so we don't accidentally kill something else
};

function planHWGW(ns: NS, target: string) {
    const ramNet = new RamNet(ns);
    const availableThreads = ramNet.blocks.reduce( // underestimates slightly
        (acc, block) => acc + Math.floor(block.ram / 1.75),
        0
    );
    let best = [0, 0, 0, 0];
    let bestHackTaken = 0;
    const hackPercent = ns.hackAnalyze(target);
    for (let hackThreads = 1; GROW_COMPENSATION * hackPercent * hackThreads < 1; hackThreads++) {
        const weaken1Threads = Math.ceil((ns.hackAnalyzeSecurity(hackThreads) / ns.weakenAnalyze(1)));
        if (weaken1Threads > 1) {
            break;
        }
        const growThreads = Math.ceil(ns.growthAnalyze(target, 1 / (1 - GROW_COMPENSATION * hackPercent * hackThreads)));
        const weaken2Threads = Math.ceil(ns.growthAnalyzeSecurity(growThreads) / ns.weakenAnalyze(1));
        const memoryConstrainedBatchCount = Math.floor(availableThreads / (hackThreads + growThreads + weaken1Threads + weaken2Threads));
        let batch_count = Math.min(MAX_BATCHES, memoryConstrainedBatchCount);
        if (batch_count < 10000) {
            // for low RAM, we need to actually schedule
            // for high RAM, this is less important and more expensive
            const ramNet = new RamNet(ns);
            let batches = 0;
            while (true) {
                let canSchedule = [
                    launchHack(ns, target, hackThreads, ramNet, true),
                    launchWeaken(ns, target, weaken1Threads, ramNet, true),
                    launchGrow(ns, target, growThreads, ramNet, true),
                    launchWeaken(ns, target, weaken2Threads, ramNet, true)
                ];
                if (canSchedule.some(x => !x)) {
                    break;
                }
                batches++;
            }
            batch_count = batches;
        }

        const hackTaken = batch_count * hackThreads;
        if (hackTaken > bestHackTaken) {
            best = [hackThreads, weaken1Threads, growThreads, weaken2Threads];
            bestHackTaken = hackTaken;
        }
    }

    if (!bestHackTaken) {
        if (hackPercent >= 1) {
            // woahhhhh... hyper-endgame, eh? Some arbitrary numbers so it doesn't crash
            const hackThreads = 0.5;
            const growThreads = Math.ceil(ns.growthAnalyze(target, 2.1));
            return [
                hackThreads,
                0,
                growThreads,
                Math.ceil((ns.hackAnalyzeSecurity(0.5) + ns.growthAnalyzeSecurity(growThreads)) / ns.weakenAnalyze(1))];
        } else {
            throw new Error(`Failed to plan HWGW.`);
        }
    }
    ns.print(`Planned / Estimated batches: ${bestHackTaken / best[0]}`);
    return best;
}


export async function main(ns: NS) {
    ns.disableLog('ALL');
    const REMOTE_SCRIPTS = [
        "/batcher/shotgun_hack.js",
        "/batcher/shotgun_grow.js",
        "/batcher/shotgun_weaken.js",
        "/batcher/shotgun_hack_half.js"
    ];
    // Force module compilation
    const pids = [ns.run(REMOTE_SCRIPTS[0]), ns.run(REMOTE_SCRIPTS[1]), ns.run(REMOTE_SCRIPTS[2]), ns.run(REMOTE_SCRIPTS[3])];
    for (let pid of pids) {
        while (ns.isRunning(pid)) await ns.sleep(0);
    }
    ns.tail();
    const dataPort = ns.getPortHandle(ns.pid);
    dataPort.clear();

    while (true) {
        const allServers = getAllServers(ns, "home");
        allServers.forEach(x => ns.scp(REMOTE_SCRIPTS, x, "home"));

        const target = ns.args[0] as string ?? getOptimalTarget(ns);
        const server = ns.getServer(target);

        if (server.hackDifficulty > server.minDifficulty || server.moneyAvailable < server.moneyMax) {
            ns.print(`Prepping ${target}`);
            const completionTime = await prepServer(ns, target);
            if (server.moneyAvailable < server.moneyMax * 0.7 || server.hackDifficulty > server.minDifficulty * 1.15) {
                // If the server is ridiculously bad, wait until prep is done
                ns.print(`WARN: Batcher sleeping for ${ns.tFormat(completionTime)} for prep to finish. Server is in a bad state.`);
                await ns.sleep(completionTime + SLEEP_SLACK_TIME);
                continue; // don't batch and check prepping again
            }
        }
        ns.print(`Batching ${target}`);
        let [hackThreads, weaken1Threads, growThreads, weaken2Threads] = planHWGW(ns, target);
        ns.print(`HWGW: ${hackThreads} / ${weaken1Threads} / ${growThreads} / ${weaken2Threads}`);

        const ramNet = new RamNet(ns);
        let batches_launched = 0;
        while (batches_launched < MAX_BATCHES) {
            const pids = [
                launchHack(ns, target, hackThreads, ramNet, false),
                launchWeaken(ns, target, weaken1Threads, ramNet, false),
                launchGrow(ns, target, growThreads, ramNet, false),
                launchWeaken(ns, target, weaken2Threads, ramNet, false)
            ];
            if (pids.some(x => !x)) {
                pids.forEach(x => x && ns.kill(x));
                break;
            }
            batches_launched++;
        }
        ns.print(`Launched ${batches_launched} batches on ${target}`);
        ns.print(`Sleeping for ${ns.tFormat(ns.getWeakenTime(target))} for batch to finish`);
        await ns.sleep(ns.getWeakenTime(target) + SLEEP_SLACK_TIME);
    }
}