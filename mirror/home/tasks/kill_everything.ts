import { getAllServers } from "./utils";


export function main(ns: NS) {
    const servers = getAllServers(ns, "home");

    for (const server of servers) {
        if (!ns.hasRootAccess(server)) {
            continue;
        }
        ns.killall(server, true);
    }
}