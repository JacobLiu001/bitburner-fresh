import { SECURITY_PER_GROW, SECURITY_PER_WEAKEN } from "./constants";
import { RAMCluster } from "./RAMCluster";
import { getAllServers, isPrepped } from "./utils";

const SCRIPTS = [
    "/batcher/dumb_grow.ts",
    "/batcher/dumb_weaken.ts",
];

function getPrepThreads(cluster: RAMCluster): number {
    const blocks = cluster.getBlocksClone();
    const blocksWithoutHome = blocks;
    return blocksWithoutHome.reduce((acc, block) => acc + Math.floor(block.ram / 1.75), 0);
}


function allocateThreads(
    ns: NS,
    target: string,
    totalThreads: number
): { weakenThreads: number, growThreads: number; } {
    const targetSecurityDelta = ns.getServerMinSecurityLevel(target) - ns.getServerSecurityLevel(target);
    const Sw = SECURITY_PER_WEAKEN;
    const Sg = SECURITY_PER_GROW;
    const growThreadsMax = Math.max(0, Math.floor((targetSecurityDelta + Sw * totalThreads) / (Sw + Sg)));
    const growThreadsMoney = Math.ceil(ns.growthAnalyze(target, ns.getServerMaxMoney(target) / ns.getServerMoneyAvailable(target), 1) * 1.01);
    const growThreads = Math.min(totalThreads, growThreadsMax, growThreadsMoney);
    const weakenThreads = Math.min(totalThreads - growThreads, Math.ceil((-targetSecurityDelta + growThreads * Sg) / Sw));

    return { weakenThreads, growThreads };
}

export function autocomplete(data: AutocompleteData, args: string[]) {
    return data.servers;
}

export async function main(ns: NS) {
    ns.tail();
    const target = ns.args[0] as string;
    const cluster: RAMCluster = new RAMCluster(ns, getAllServers(ns, "home"), SCRIPTS);

    while (!isPrepped(ns, target)) {
        const totalThreads = getPrepThreads(cluster);
        let { weakenThreads: wT, growThreads: gT } = allocateThreads(ns, target, totalThreads);

        ns.print(`${wT} weaken, ${gT} grow`);

        // alloc other:
        const blocks = cluster.getBlocksClone();

        // alloc weaken on home since cores => overweaken, which is fine, but underweakening is difficult without formulas
        {
            const block = blocks[blocks.length - 1];
            if (wT <= 0) {
                break;
            }
            const threads = Math.min(wT, Math.floor(block.ram / 1.75));
            if (threads === 0) {
                continue;
            }
            ns.exec("/batcher/dumb_weaken.ts", "home", threads, target);
            wT -= threads;
            block.ram -= threads * 1.75;
        }

        // alloc weaken on small blocks first
        for (const block of blocks) {
            if (wT <= 0) {
                break;
            }
            const threads = Math.min(wT, Math.floor(block.ram / 1.75));
            if (threads === 0) {
                continue;
            }
            ns.exec("/batcher/dumb_weaken.ts", block.server, threads, target);
            wT -= threads;
            block.ram -= threads * 1.75;
        }

        for (const block of blocks.reverse()) {
            if (gT <= 0) {
                break;
            }
            if (block.server === "home") {
                continue;
            }
            const threads = Math.min(gT, Math.floor(block.ram / 1.75));
            ns.exec("/batcher/dumb_grow.ts", block.server, threads, target);
            gT -= threads;
            block.ram -= threads * 1.75;
        }

        // alloc weaken

        await ns.sleep(ns.getWeakenTime(target) + 100);
    }
}