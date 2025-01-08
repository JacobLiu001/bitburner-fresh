import { getAllServers } from "./utils";

export async function main(ns: NS) {
    const allServers = getAllServers(ns, "home");
    for (const server of allServers) {
        const filelist = ns.ls(server, "/tmp");
        filelist.forEach(file => {
            ns.rm(file, server);
        });
    }
}