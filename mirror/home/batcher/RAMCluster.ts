import { Job, Block, RAMCluster as IRAMCluster } from "./typedefs";

export class RAMCluster implements IRAMCluster {
    static readonly #HOME_RESERVE = 32;
    static readonly #IGNORE_RUNNING = true;
    // We model a server cluster to be a list of servers, each with a certain amount of RAM, allocatable as blocks.
    #blocks: Block[] = [];

    // These are to be set in the constructor during the discovery phase.
    #minBlockSize: number = Infinity;
    #maxBlockSize: number = 0;
    #unusedRam: number = 0; // INVARIANT: unusedRam = sum of block.ram
    #maxRam = 0;

    // inverted index: maps server name to index in the blocks array.
    #index: Map<string, number> = new Map();

    /**
     * Comparison function for sorting the servers by RAM (ascending). Always puts home at the end.
     */
    static #compareServers(a: Block, b: Block) {
        if (a.server === "home") { // always put home at the end
            return 1;
        }
        if (b.server === "home") {
            return -1;
        }
        return a.maxRam - b.maxRam;
    };

    constructor(ns: NS, servers: string[]) {
        for (const server of servers) {
            if (!ns.hasRootAccess(server)) {
                continue;
            }
            const reserved = server === "home" ? RAMCluster.#HOME_RESERVE : 0;
            const maxRam = ns.getServerMaxRam(server) - reserved;
            if (maxRam <= 0) {
                continue;
            }
            const used = Math.min(maxRam, (RAMCluster.#IGNORE_RUNNING ? 0 : ns.getServerUsedRam(server)));
            const ram = maxRam - used;
            this.#blocks.push({ server, ram, maxRam });
            this.#minBlockSize = Math.min(this.#minBlockSize, ram);
            this.#maxBlockSize = Math.max(this.#maxBlockSize, ram);
            this.#unusedRam += ram;
            this.#maxRam += maxRam;
        }
        this.#blocks.sort(RAMCluster.#compareServers);
        this.#blocks.forEach((block, index) => this.#index.set(block.server, index));
    }

    // ugh OOP boilerplate
    get unusedRam() { return this.#unusedRam; }
    get maxRam() { return this.#maxRam; }
    get maxBlockSize() { return this.#maxBlockSize; }

    update(ns: NS, servers: string[]) {
        // Because servers can change in available RAM, we can't just keep the old values.
        // so this is basically the constructor...
        // This is safe because Javascript is cooperative concurrency
        // So as long as we don't yield, nobody else will be running and reading an intermediate state.
        this.#blocks = [];
        this.#minBlockSize = Infinity;
        this.#maxBlockSize = 0;
        this.#unusedRam = 0;
        this.#maxRam = 0;
        this.#index = new Map();

        for (const server of servers) {
            if (!ns.hasRootAccess(server)) {
                continue;
            }
            const reserved = server === "home" ? RAMCluster.#HOME_RESERVE : 0;
            const maxRam = ns.getServerMaxRam(server) - reserved;
            if (maxRam <= 0) {
                continue;
            }
            const used = Math.min(maxRam, (RAMCluster.#IGNORE_RUNNING ? 0 : ns.getServerUsedRam(server)));
            const ram = maxRam - used;
            this.#blocks.push({ server, ram, maxRam });
            this.#minBlockSize = Math.min(this.#minBlockSize, ram);
            this.#maxBlockSize = Math.max(this.#maxBlockSize, ram);
            this.#unusedRam += ram;
            this.#maxRam += maxRam;
        }
        this.#blocks.sort(RAMCluster.#compareServers);
        this.#blocks.forEach((block, index) => this.#index.set(block.server, index));
        ns.tprint(`Updated RAMCluster with ${this.#blocks.length} servers.`);
        this.printBlocks(ns);
    }

    getBlock(server: string) {
        const index = this.#index.get(server);
        if (index === undefined) {
            throw new Error(`Server ${server} not found in RAMCluster`);
        }
        return this.#blocks[index];
    }

    assign(job: Job): boolean {
        // just find the first one that fits.
        // Perhaps do a best-fit algorithm to minimize fragmentation?
        const block = this.#blocks.find(block => block.ram >= job.cost);
        if (block === undefined) {
            return false;
        }
        job.server = block.server;
        block.ram -= job.cost;
        this.#unusedRam -= job.cost;
        return true;
    }

    free(job: Job) {
        const block = this.getBlock(job.server);
        block.ram += job.cost;
        this.#unusedRam += job.cost;
    }

    printBlocks(ns: NS, alsoPrintToTerminal: boolean = false) {
        this.#blocks.forEach(block => ns.print(`${block.server}: ${block.ram}/${block.maxRam}`));
        if (alsoPrintToTerminal) {
            this.#blocks.forEach(block => ns.tprint(`${block.server}: ${block.ram}/${block.maxRam}`));
        }
    }

    getBlocksClone() {
        return this.#blocks.map(block => ({ ...block }));
    }

    /**
     * Naively calculate max batches by assigning threads to servers (Dry-run).
     * IGNORES RUNNING THREADS.
     * @param threadCosts The costs of every thread block
     * @returns max concurrent batches possible.
     */
    allocateBatches(ns: NS, threadCosts: number[]) {
        const blocks = this.getBlocksClone();
        let batches = 0;
        let found = true;
        while (found) {
            found = true;
            for (const cost of threadCosts) {
                const block = blocks.find(b => b.maxRam >= cost);
                if (block) {
                    block.maxRam -= cost;
                } else {
                    found = false;
                    break;
                }
            }
            if (found) {
                batches++;
            }
        }
        return batches;
    }
}