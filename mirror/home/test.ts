import { parseNumber } from "./utils";

export async function main(ns: NS) {
    ns.tprint(`Parsed ${ns.args[0]}: ${parseNumber(ns.args[0] as string, true)}`);
}