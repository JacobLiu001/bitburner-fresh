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

export function getAllServersAndDistribute(ns: NS, root: string, scripts_to_copy: string[]) {
    const servers = getAllServers(ns, root);
    for (const server of servers) {
        if (server === root) {
            continue;
        }
        if (!ns.scp(scripts_to_copy, server, root)) {
            throw new Error(`Failed to copy ${scripts_to_copy} to server ${server}`);
        }
    }
}
