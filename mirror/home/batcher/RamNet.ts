import { getAllServers } from "./utils";

export type Block = { name: string, ram: number; };
export class RamNet {
    readonly HOME_RESERVE = function (ram: number) {
        return Math.max(32, Math.min(ram / 16, 128));
    };
    blocks: Block[];
    #ns: NS;

    constructor(ns: NS) {
        this.#ns = ns;
        this.blocks = getAllServers(ns, "home")
            .map(ns.getServer)
            .filter(server => server.maxRam && server.hasAdminRights)
            .map(server => ({
                name: server.hostname,
                ram: ((server.hostname === "home" ? server.maxRam - this.HOME_RESERVE(server.maxRam) : server.maxRam) - server.ramUsed)
            }))
            .sort((a, b) => a.ram - b.ram);
    }

    update() {
        const ns = this.#ns;
        this.blocks = getAllServers(ns, "home")
            .map(ns.getServer)
            .filter(server => server.maxRam && server.hasAdminRights)
            .map(server => ({
                name: server.hostname,
                ram: ((server.hostname === "home" ? server.maxRam - this.HOME_RESERVE(server.maxRam) : server.maxRam) - server.ramUsed)
            }))
            .sort((a, b) => a.ram - b.ram);
    }
}