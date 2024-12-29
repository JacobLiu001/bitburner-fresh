import { getAllServers } from "./utils";


export function main(ns: NS) {
    const vulns = [
        { filename: "BruteSSH.exe", func: ns.brutessh },
        { filename: "FTPCrack.exe", func: ns.ftpcrack },
        { filename: "relaySMTP.exe", func: ns.relaysmtp },
        { filename: "HTTPWorm.exe", func: ns.httpworm },
        { filename: "SQLInject.exe", func: ns.sqlinject }
    ].filter(({ filename }) => ns.fileExists(filename, "home"));

    const servers = getAllServers(ns, "home");

    for (const server of servers) {
        if (ns.hasRootAccess(server)) {
            continue;
        }
        for (const { func } of vulns) {
            func(server);
        }
        try {
            ns.nuke(server);
        } catch (e) { }
    }
}