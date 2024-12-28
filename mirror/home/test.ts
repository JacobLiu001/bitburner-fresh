import { getDataNewProcess } from "./utils";

export async function main(ns: NS) {
    const res = await getDataNewProcess(ns, "ns.getServerMoneyAvailable('nwo')", [], ns.run, []);
    ns.tprint(res);
}