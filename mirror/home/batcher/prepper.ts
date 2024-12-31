import { RamNet } from "./RamNet";

// Use the non-hard-coded versions if you're in lategame
const SLEEP_EXTRA = 20;

export async function prepServer(ns: NS, target: string) {
    let server = ns.getServer(target);
    let wT = Math.ceil((server.hackDifficulty - server.minDifficulty) / ns.weakenAnalyze(1));
    while (wT) {
        const ramNet = new RamNet(ns);
        for (let block of ramNet.blocks) {
            if (wT <= 0) {
                break;
            }
            if (block.ram < 1.75) {
                continue;
            }
            const threads = Math.min(Math.floor(block.ram / 1.75), wT);
            ns.exec("./shotgun_weaken.js", block.name, threads, target);
            block.ram -= threads * 1.75;
            wT -= threads;
        }
        if (wT) {
            ns.print(`Sleeping for ${ns.tFormat(ns.getWeakenTime(target))} for weaken to finish`);
            await ns.sleep(ns.getWeakenTime(target) + SLEEP_EXTRA);
            server = ns.getServer(target);
        }
    }

    while (server.moneyAvailable < server.moneyMax) {
        ns.print(`Security: ${server.hackDifficulty} / ${server.minDifficulty}`);
        ns.print(`Money: ${server.moneyAvailable} / ${server.moneyMax}`);
        const ramNet = new RamNet(ns);
        const availableThreads = ramNet.blocks.reduce((acc, block) => acc + Math.floor(block.ram / 1.75), 0);

        // g + w <= t, Sg * g - Sw * w <= 0
        const growThreads = Math.min(
            Math.floor(0.95 * availableThreads / (ns.growthAnalyzeSecurity(1) + ns.weakenAnalyze(1)) * ns.weakenAnalyze(1)),
            Math.ceil(ns.growthAnalyze(target, server.moneyMax / server.moneyAvailable) * 1.01 + 2)
        );
        ns.print(`Target Grow threads: ${growThreads}`);

        let growThreadCount = 0, weakenThreadCount = 0, growThreadLeft = growThreads;
        while (growThreadLeft > 0) {
            ramNet.update();
            const biggestServer = ramNet.blocks.at(-1);
            const actualGrowThreads = Math.min(growThreadLeft, Math.floor(biggestServer.ram / 1.75));
            // 0 spacer shotgun moment
            const pid = ns.exec("/batcher/shotgun_grow.js", biggestServer.name, actualGrowThreads, target, ns.getWeakenTime(target) - ns.getGrowTime(target));
            if (!pid) {
                ns.print(`Failed to launch grow on ${biggestServer.name}`, "warning");
            }
            biggestServer.ram -= actualGrowThreads * 1.75;
            growThreadLeft -= actualGrowThreads;
            growThreadCount += actualGrowThreads;
            if (biggestServer.ram < 1.75) {
                ramNet.blocks.pop();
            }

            let weakenThreads = Math.ceil(ns.growthAnalyzeSecurity(actualGrowThreads) / ns.weakenAnalyze(1));
            for (const block of ramNet.blocks) {
                if (weakenThreads <= 0) {
                    break;
                }
                if (block.ram < 1.75) {
                    continue;
                }
                const threads = Math.min(Math.floor(block.ram / 1.75), weakenThreads);
                const pid = ns.exec("/batcher/shotgun_weaken.js", block.name, threads, target);
                if (!pid) {
                    ns.print(`Failed to launch weaken on ${block.name}`, "warning");
                }
                block.ram -= threads * 1.75;
                weakenThreads -= threads;
                weakenThreadCount += threads;
            }
        }
        ns.print(`Launched G:${growThreadCount} W:${weakenThreadCount}.`);
        if (growThreadCount + weakenThreadCount < availableThreads * 0.8) {
            // a lot of left-over RAM.
            ns.print(`A lot of left-over RAM. Early exiting prepper to schedule the rest for batching.`);
            return ns.getWeakenTime(target) + SLEEP_EXTRA;
        }
        ns.print(`Sleeping for ${ns.tFormat(ns.getWeakenTime(target))} for grow to finish`);
        await ns.sleep(ns.getWeakenTime(target) + SLEEP_EXTRA);
        server = ns.getServer(target);
    }
    return 0;
}

export async function main(ns: NS) {
    ns.disableLog('ALL');
    ns.tail();
    const target = ns.args[0] as string;
    await prepServer(ns, target);
}
