const argsSchema: [string, string][] = [
    ["buy", ""],
    ["get-price", ""],
    ["upgrade-all", ""],
];

export function autocomplete(data: AutocompleteData, args: string[]) {
    data.flags(argsSchema);
    return [];
}

const ALLOWED_RAM = [...Array(20).keys().map(i => Math.pow(2, i + 1))];

function parseMemory(memory: string) {
    const SUFFIXES = ["G", "T", "P", "E"];
    const suffix = memory.slice(-1).toUpperCase();
    const num = memory.slice(0, -1);
    const mult = Math.pow(1024, SUFFIXES.indexOf(suffix));
    return parseFloat(num) * mult;
}

function buy(ns: NS, args: string[]) {
    const [amountStr, name = `pserv-${ns.getPurchasedServers().length}`] = args;
    const amount = parseMemory(amountStr);
    if (!ALLOWED_RAM.includes(amount)) {
        ns.tprint(`ERROR: Invalid amount: ${amount}`);
        return;
    }
    if (ns.purchaseServer(name, amount)) {
        ns.tprint(`SUCCESS: Bought server ${name} with ${amount}GB RAM`);
    } else {
        ns.tprint(`ERROR: Failed to buy server ${name}`);
    }
}

function getPrice(ns: NS, args: string[]) {
    const [amountStr] = args;
    const amount = parseMemory(amountStr);
    if (!ALLOWED_RAM.includes(amount)) {
        ns.tprint(`ERROR: Invalid amount: ${amount}`);
        return;
    }
    ns.tprint(`Price: ${ns.getPurchasedServerCost(amount)}`);
}

function upgradeAll(ns: NS, args: string[]) {
    const [amountStr] = args;
    const amount = parseMemory(amountStr);
    for (const server of ns.getPurchasedServers()) {
        ns.upgradePurchasedServer(server, amount);
    }
}

export async function main(ns: NS) {
    const [action, ...args] = ns.args as string[];
    switch (action) {
        case "--buy":
            buy(ns, args);
            break;
        case "--get-price":
            getPrice(ns, args);
            break;
        case "--upgrade-all":
            upgradeAll(ns, args);
            break;
        default:
            ns.tprint(`Unknown action: ${action}`);
    }
}