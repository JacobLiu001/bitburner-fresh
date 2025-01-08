import { getAllServers } from "./utils";

export async function main(ns: NS) {
    const allServers = getAllServers(ns, "home");
    ns.write("/tmp/all_servers.txt", JSON.stringify(allServers), "w");
    ns.write("/tmp/all_rooted.txt", JSON.stringify(allServers.filter(s => ns.hasRootAccess(s))), "w");
}