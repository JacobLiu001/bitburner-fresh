import { parseNumber } from "./utils";

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

function buy(ns: NS, args: string[]) {
    const [amountStr, name = `pserv-${ns.getPurchasedServers().length}`] = args;
    const amount = parseNumber(amountStr, true);
    if (!ALLOWED_RAM.includes(parseNumber(amount))) {
        ns.tprint(`ERROR: Invalid amount: ${amount}`);
        return;
    }
    if (ns.purchaseServer(name, parseNumber(amount))) {
        ns.tprint(`SUCCESS: Bought server ${name} with ${amount}GB RAM`);
    } else {
        ns.tprint(`ERROR: Failed to buy server ${name}`);
    }
}

function getPrice(ns: NS, args: string[]) {
    const [amountStr] = args;
    const amount = parseNumber(amountStr, true);
    if (!ALLOWED_RAM.includes(amount)) {
        ns.tprint(`ERROR: Invalid amount: ${amount}`);
        return;
    }
    ns.tprint(`Price: ${ns.getPurchasedServerCost(amount)}`);
}

function upgradeAll(ns: NS, args: string[]) {
    const [amountStr] = args;
    const amount = parseNumber(amountStr, true);
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