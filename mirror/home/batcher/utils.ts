import {
    SECURITY_PER_HACK,
    SECURITY_PER_GROW,
    SECURITY_PER_WEAKEN,
    COSTS,
} from "./constants";

export function isPrepped(ns: NS, server: string): boolean {
    const EPSILON = 0.0001;
    const maxMoney = ns.getServerMaxMoney(server);
    const money = ns.getServerMoneyAvailable(server);
    const minSecurity = ns.getServerMinSecurityLevel(server);
    const security = ns.getServerSecurityLevel(server);
    return (money === maxMoney && Math.abs(security - minSecurity) < EPSILON);
}

export function preFormulasThreadCalc(
    ns: NS, server: string, money: number
): { hackThreads: number; growThreads: number; weaken1Threads: number; weaken2Threads: number; } {
    const hackPerThread = ns.hackAnalyze(server);
    const hackThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(server, money)), 1);
    const trueMoneyProportionTaken = hackPerThread * hackThreads;
    const growThreads = Math.ceil(
        ns.growthAnalyze(
            server, money / (money - money * trueMoneyProportionTaken)
        ) * 1.01
    );
    const weaken1Threads = Math.max(Math.ceil(hackThreads * SECURITY_PER_HACK / SECURITY_PER_WEAKEN), 1);
    const weaken2Threads = Math.max(Math.ceil(growThreads * SECURITY_PER_GROW / SECURITY_PER_WEAKEN), 1);
    return { hackThreads, growThreads, weaken1Threads, weaken2Threads };
}



// export async function optimizeProfile(ns: NS, profile: ServerProfile, cluster: RAMCluster) {
//     const maxThreads = cluster.maxBlockSize / 1.75; // max threads per thread block
//     const maxMoney = profile.maxMoney;
//     const weakenTime = profile.weakenTime;

//     const minMoneyTake = 0.001;
//     const maxMoneyTake = 0.3;
//     const maxSpacer = weakenTime;
//     const stepValue = 0.01;
//     const spacerStep = 1;

//     let moneyTake = maxMoneyTake;
//     let spacer = profile.spacer;

//     while (moneyTake > minMoneyTake && spacer < maxSpacer) {
//         await ns.sleep(0);
//         const concurrentBatches = Math.ceil(weakenTime / (4 * spacer)) + 1;
//         const amountToTake = maxMoney * moneyTake;

//         const { hackThreads, growThreads, weaken1Threads, weaken2Threads } = preFormulasThreadCalc(ns, profile.target, amountToTake);

//         if (Math.max(hackThreads, growThreads, weaken1Threads, weaken2Threads) <= maxThreads) {
//             const threadCosts = [
//                 hackThreads * COSTS.hack,
//                 weaken1Threads * COSTS.weaken1,
//                 growThreads * COSTS.grow,
//                 weaken2Threads * COSTS.weaken2
//             ];
//             const totalCost = threadCosts.reduce((acc, cost) => acc + cost, 0) * concurrentBatches;
//             if (totalCost < cluster.unusedRam) {
//                 // verify that we can actually run this
//                 const batchCount = cluster.allocateBatches(ns, threadCosts);
//                 if (batchCount >= concurrentBatches) {
//                     // solution found!
//                     profile.spacer = spacer;
//                     profile.batches = concurrentBatches;
//                     profile.hackRatio = moneyTake;
//                     return;
//                 }
//             }
//         }

//         moneyTake -= stepValue;
//         if (moneyTake < minMoneyTake && spacer < maxSpacer) {
//             moneyTake = maxMoneyTake;
//             spacer += spacerStep;
//         }
//         continue;
//     }
//     throw new Error("What the fuck. Scheduling was found to be impossible.");
// }


export function getAllServers(ns: NS, root: string) {
    const visited: string[] = [];
    const stack: string[] = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (visited.includes(current)) {
            continue;
        }
        visited.push(current);
        stack.push(...ns.scan(current));
    }
    return visited;
}