
export async function main(ns: NS) {
    if (ns.self().server !== "home") {
        throw new Error("This script must be run on home. I can't be bothered to make it work since it's only for bootstrapping.");
    }
    if (!ns.run("/tasks/root_all.ts")) {
        throw new Error("Couldn't try to root max num of servers.")
    }
    await ns.sleep(100); // can't be bothered to set up ipc...
    const target: string = ns.args[0] as string;
    // do not grow, only hack and weaken
    const availableRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    ns.print(`Available RAM: ${availableRam}`);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const weakenTime = ns.getWeakenTime(target);
    while (ns.getServerMoneyAvailable(target) >= 10) {
        const security = ns.getServerSecurityLevel(target);
        const deltaSecurity = security - minSecurity;

        if (security - minSecurity >= 0.05 * Math.floor(availableRam / 1.75)) {
            // every thread to weaken
            const threads = Math.floor(availableRam / 1.75);
            ns.print(`Weakening ${target} with ${threads} threads`);
            ns.run("/batcher/dumb_weaken.ts", threads, target);
            await ns.sleep(weakenTime);
        } else {
            const hackThreads = Math.max(0, Math.floor((6.25 * availableRam - 1.75 * 125 * deltaSecurity) / (1.75 + 1.7 * 6.25)) - 2);
            const weakenThreads = Math.floor((availableRam - 1.7 * hackThreads) / 1.75);
            ns.print(`${target} with H:${hackThreads} + W:${weakenThreads} threads`);
            if (!ns.run("/batcher/dumb_weaken.ts", weakenThreads, target)) {
                throw new Error("Failed to run weaken");
            }
            if (!ns.run("/batcher/dumb_hack.ts", hackThreads, target)) {
                throw new Error("Failed to run weaken");
            }
            await ns.sleep(weakenTime / 4 + 100);
            if (!ns.run("/batcher/dumb_hack.ts", hackThreads, target)) {
                throw new Error("Failed to run weaken");
            }
            await ns.sleep(weakenTime / 4 + 100);
            if (!ns.run("/batcher/dumb_hack.ts", hackThreads, target)) {
                throw new Error("Failed to run weaken");
            }
            await ns.sleep(weakenTime / 4 + 100);
            if (!ns.run("/batcher/dumb_hack.ts", hackThreads, target)) {
                throw new Error("Failed to run weaken");
            }
            await ns.sleep(weakenTime / 4 + 100);
        }
    }
}