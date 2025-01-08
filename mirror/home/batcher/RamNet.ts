import { getAllServers } from "./utils";

export type Block = { name: string, ram: number; };
export class RamNet {
    readonly HOME_RESERVE = function (ram: number) {
        // reserve 6.25% of the home server's RAM, clamped to 32-128
        return Math.max(32, Math.min(ram / 16, 128));
    };
    blocks: Block[];
    #ns: NS;
    #maxRam: number;

    constructor(ns: NS) {
        this.#ns = ns;
        this.update();
    }

    update() {
        const ns = this.#ns;
        this.#maxRam = 0;
        this.blocks = getAllServers(ns, "home")
            .map(ns.getServer)
            .filter(server => server.maxRam && server.hasAdminRights)
            .map(server => {
                // !! side effect in map
                let serverMaxRam = (server.hostname === "home" ? server.maxRam - this.HOME_RESERVE(server.maxRam) : server.maxRam);
                this.#maxRam += serverMaxRam;
                return {
                    name: server.hostname,
                    ram: (serverMaxRam - server.ramUsed)
                };
            })
            .sort((a, b) => a.ram - b.ram);
    }

    get availableRam() {
        return this.blocks.reduce((acc, block) => acc + block.ram, 0);
    }

    get maxRam() {
        return this.#maxRam;
    }

    get usedRam() {
        return this.#maxRam - this.availableRam;
    }

    get utilizationRatio() {
        return this.usedRam / this.maxRam;
    }
}