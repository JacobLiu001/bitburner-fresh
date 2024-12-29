export const SECURITY_PER_HACK = 0.002;
export const SECURITY_PER_GROW = 0.004;
export const SECURITY_PER_WEAKEN = 0.05;


export const TYPES: ("hack" | "weaken1" | "grow" | "weaken2")[] = ["hack", "weaken1", "grow", "weaken2"];
export const WORKERS = ["/batcher/jhack.ts", "/batcher/jweaken.ts", "/batcher/jgrow.ts"];
export const SCRIPTS = {
    hack: "/batcher/jhack.ts",
    weaken1: "/batcher/jweaken.ts",
    grow: "/batcher/jgrow.ts",
    weaken2: "/batcher/jweaken.ts"
};
export const COSTS = { hack: 1.7, weaken1: 1.75, grow: 1.75, weaken2: 1.75 };

export function isPrepped(ns: NS, server: string): boolean {
    const EPSILON = 0.0001;
    const maxMoney = ns.getServerMaxMoney(server);
    const money = ns.getServerMoneyAvailable(server);
    const minSecurity = ns.getServerMinSecurityLevel(server);
    const security = ns.getServerSecurityLevel(server);
    return (money === maxMoney && Math.abs(security - minSecurity) < EPSILON);
}

function preFormulasThreadCalc(
    ns: NS, server: string, money: number
): { hackThreads: number; growThreads: number; weaken1Threads: number; weaken2Threads: number; } {
    const hackPerThread = ns.hackAnalyze(server);
    const hackThreads = Math.max(Math.floor(ns.hackAnalyzeThreads(server, money)), 1);
    const trueMoneyProportionTaken = hackPerThread * hackThreads;
    const growThreads = Math.ceil(
        ns.growthAnalyze(
            server, money / (money - money * trueMoneyProportionTaken)
        ) * 1.01
    );
    const weaken1Threads = Math.max(Math.ceil(hackThreads * SECURITY_PER_HACK / SECURITY_PER_WEAKEN), 1);
    const weaken2Threads = Math.max(Math.ceil(growThreads * SECURITY_PER_GROW / SECURITY_PER_WEAKEN), 1);
    return { hackThreads, growThreads, weaken1Threads, weaken2Threads };
}


export class ServerProfile {
    readonly target: string;
    readonly maxMoney: number;
    readonly minSecurity: number;

    batches: number; // number of batches to run. An optimizer will set this.
    hackRatio: number = 0.001; // ratio of money to hack.

    // these change over time
    money: number;
    security: number;
    prepped: boolean;
    hackChance: number;
    weakenTime: number;

    // dynamically adjusted params
    delay: number;
    spacer: number; // miliseconds
    times: { hack: number, weaken1: number, grow: number, weaken2: number; };
    end: number;
    threads: { hack: number, weaken1: number, grow: number, weaken2: number; };

    constructor(ns: NS, server: string) {
        this.target = server;
        this.maxMoney = ns.getServerMaxMoney(server);
        this.minSecurity = ns.getServerMinSecurityLevel(server);

        this.batches = 0; // to be set by the optimizer

        this.money = Math.max(ns.getServerMoneyAvailable(server), 1);
        this.security = ns.getServerSecurityLevel(server);
        this.prepped = isPrepped(ns, server);
        this.hackChance = ns.hackAnalyzeChance(server);
        this.weakenTime = ns.getWeakenTime(server);

        this.delay = 0;
        this.spacer = 5;
        this.times = { hack: 0, weaken1: 0, grow: 0, weaken2: 0 };
        this.threads = { hack: 0, weaken1: 0, grow: 0, weaken2: 0 };
        this.end = 0;
    }

    update(ns: NS) {
        this.money = ns.getServerMoneyAvailable(this.target);
        this.security = ns.getServerSecurityLevel(this.target);
        this.weakenTime = ns.getWeakenTime(this.target);
        this.times = {
            hack: this.weakenTime / 4,
            weaken1: this.weakenTime,
            grow: this.weakenTime * 0.8,
            weaken2: this.weakenTime
        };

        if (!isPrepped(ns, this.target)) {
            return;
        }
        const { hackThreads, growThreads, weaken1Threads, weaken2Threads } = preFormulasThreadCalc(ns, this.target, this.money * this.hackRatio);
        this.threads = {
            hack: hackThreads,
            weaken1: weaken1Threads,
            grow: growThreads,
            weaken2: weaken2Threads
        };
        this.hackChance = ns.hackAnalyzeChance(this.target);
    }
}


interface IDable {
    id: string;
}

export class Job implements IDable {
    type: "hack" | "weaken1" | "grow" | "weaken2";
    end: number;
    time: number;
    target: string;
    threads: number;
    cost: number;
    server: string;
    report: boolean;
    port: number;
    batch: number;
    pid: number;
    id: string;

    constructor(ns: NS, type: "hack" | "weaken1" | "grow" | "weaken2", profile: ServerProfile, batch: number) {
        this.type = type;
        this.end = profile.end;
        this.time = profile.times[type];
        this.target = profile.target;
        this.threads = profile.threads[type];
        this.cost = this.threads * COSTS[type];
        this.server = "";
        this.report = true;
        this.port = ns.pid;
        this.batch = batch;

        this.id = type + batch;
    }
}

type block = { server: string; ram: number; };
export class RAMCluster {
    // We model a server cluster to be a list of servers, each with a certain amount of RAM, allocatable as blocks.
    #blocks: block[] = [];

    // These are to be set in the constructor during the discovery phase.
    #minBlockSize: number = Infinity;
    #maxBlockSize: number = 0;
    #unusedRam: number = 0; // INVARIANT: unusedRam = sum of block.ram
    #prepThreads: number = 0;
    #maxRam = 0;

    // inverted index: maps server name to index in the blocks array.
    #index: Map<string, number> = new Map();

    /**
     * Comparison function for sorting the servers by RAM (ascending). Always puts home at the end.
     */
    static compareServers(a: block, b: block) {
        if (a.server === "home") { // always put home at the end
            return 1;
        }
        if (b.server === "home") {
            return -1;
        }
        return a.ram - b.ram;
    };

    constructor(ns: NS, servers: string[],
        options: { ignoreRunning: boolean, reserveHome: number; } = { ignoreRunning: false, reserveHome: 32 }) {
        for (const server of servers) {
            if (!ns.hasRootAccess(server)) {
                continue;
            }
            const maxRam = ns.getServerMaxRam(server);
            if (maxRam <= 0) {
                continue;
            }
            const reserved = server === "home" ? options.reserveHome : 0;
            const used = Math.min(maxRam, (options.ignoreRunning ? 0 : ns.getServerUsedRam(server)) + reserved);
            const ram = maxRam - used;
            this.#blocks.push({ server, ram });
            this.#minBlockSize = Math.min(this.#minBlockSize, ram);
            this.#maxBlockSize = Math.max(this.#maxBlockSize, ram);
            this.#unusedRam += ram;
            this.#maxRam += maxRam;
            this.#prepThreads += Math.floor(ram / 1.75);
        }
        this.#blocks.sort(RAMCluster.compareServers);
        this.#blocks.forEach((block, index) => this.#index.set(block.server, index));
    }

    // ugh OOP boilerplate
    get unusedRam() { return this.#unusedRam; }
    get maxRam() { return this.#maxRam; }
    get maxBlockSize() { return this.#maxBlockSize; }
    get prepThreads() { return this.#prepThreads; }

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
        this.#blocks.forEach(block => ns.print(`${block.server}: ${block.ram}`));
        if (alsoPrintToTerminal) {
            this.#blocks.forEach(block => ns.tprint(`${block.server}: ${block.ram}`));
        }
    }

    getBlocksClone() {
        return this.#blocks.map(block => ({ ...block }));
    }

    /**
     * Naively allocate threads to servers.
     * @param threadCosts The costs of every thread block
     * @returns max concurrent batches possible.
     */
    allocateBatches(ns: NS, threadCosts: number[]) {
        const blocks = this.getBlocksClone();
        let batches = 0;
        let found = true;
        while (found) {
            for (const cost of threadCosts) {
                const block = blocks.find(b => b.ram >= cost);
                if (block) {
                    block.ram -= cost;
                    found = true;
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

export async function optimizeProfile(ns: NS, profile: ServerProfile, cluster: RAMCluster) {
    const maxThreads = cluster.maxBlockSize / 1.75; // max threads per thread block
    const maxMoney = profile.maxMoney;
    const weakenTime = profile.weakenTime;

    const minMoneyTake = 0.001;
    const maxMoneyTake = 0.3;
    const maxSpacer = weakenTime;
    const stepValue = 0.01;
    const spacerStep = 1;

    let moneyTake = maxMoneyTake;
    let spacer = profile.spacer;

    while (moneyTake > minMoneyTake && spacer < maxSpacer) {
        await ns.sleep(0);
        const concurrentBatches = Math.ceil(weakenTime / (4 * spacer)) + 1;
        const amountToTake = maxMoney * moneyTake;

        const { hackThreads, growThreads, weaken1Threads, weaken2Threads } = preFormulasThreadCalc(ns, profile.target, amountToTake);

        if (Math.max(hackThreads, growThreads, weaken1Threads, weaken2Threads) <= maxThreads) {
            const threadCosts = [
                hackThreads * COSTS.hack,
                weaken1Threads * COSTS.weaken1,
                growThreads * COSTS.grow,
                weaken2Threads * COSTS.weaken2
            ];
            const totalCost = threadCosts.reduce((acc, cost) => acc + cost, 0) * concurrentBatches;
            if (totalCost < cluster.unusedRam) {
                // verify that we can actually run this
                const batchCount = cluster.allocateBatches(ns, threadCosts);
                if (batchCount >= concurrentBatches) {
                    // solution found!
                    profile.spacer = spacer;
                    profile.batches = concurrentBatches;
                    profile.hackRatio = moneyTake;
                    return;
                }
            }
        }

        moneyTake -= stepValue;
        if (moneyTake < minMoneyTake && spacer < maxSpacer) {
            moneyTake = maxMoneyTake;
            spacer += spacerStep;
        }
        continue;
    }
    throw new Error("What the fuck. Scheduling was found to be impossible.");
}


/**
 * A classic Deque, implemented using a circular queue/array.
 * TODO: Delete is O(N), maybe use doubly linked list + inverted index to do everything in O(1)
 */
export class Deque<T extends IDable> {
    #capacity: number;
    #length: number = 0;
    #front: number = 0;
    #elements: T[];
    #index: Map<string, number> = new Map(); // again, inverted index

    constructor(capacity: number) {
        this.#capacity = capacity;
        this.#elements = new Array(capacity);
    }

    get size() {
        return this.#length;
    }

    get capacity() {
        return this.#capacity;
    }

    isEmpty() {
        return this.size == 0;
    }

    isFull() {
        return this.size == this.#capacity;
    }

    get #back() {
        return (this.#front + this.#length) % this.#capacity;
    }

    push(value: T) {
        if (this.isFull()) {
            throw new Error("Full deque.");
        }
        this.#elements[this.#back] = value;
        this.#index.set(value.id, this.#back);
        this.#length++;
    }

    pop() {
        if (this.isEmpty()) {
            throw new Error("Tried to pop from an empty deque.");
        }
        const item = this.#elements[this.#back];
        this.#elements[this.#back] = null;
        this.#index.delete(item.id);
        this.#length--;
        return item;
    }

    shift() {
        if (this.isEmpty()) {
            throw new Error("Tried to shift from an empty deque.");
        }
        const item = this.#elements[this.#front];
        this.#elements[this.#front] = null;
        this.#index.delete(item.id);
        this.#front = (this.#front + 1) % this.#capacity;
        this.#length--;
        return item;
    }

    unshift(value: T) {
        if (this.isFull()) {
            throw new Error("Full deque.");
        }
        this.#front = (this.#front - 1 + this.#capacity) % this.#capacity;
        this.#elements[this.#front] = value;
        this.#index.set(value.id, this.#front);
        this.#length++;
    }

    peekFront() {
        if (this.isEmpty()) {
            throw new Error("Tried to peek from an empty deque.");
        }
        return this.#elements[this.#front];
    }

    peekBack() {
        if (this.isEmpty()) {
            throw new Error("Tried to peek from an empty deque.");
        }
        return this.#elements[(this.#back - 1 + this.#capacity) % this.#capacity];
    }

    exists(id: string) {
        return this.#index.has(id);
    }

    get(id: string): T {
        const index = this.#index.get(id);
        if (index === undefined) {
            throw new Error(`ID ${id} not found in deque.`);
        }
        return this.#elements[index];
    }

    // This is O(N)!!!!
    delete(id: string): T {
        const index = this.#index.get(id);
        if (index === undefined) {
            throw new Error(`ID ${id} not found in deque.`);
        }

        const item = this.#elements[index];
        this.#elements[index] = null;

        if (index === this.#front) {
            this.#front = (this.#front + 1) % this.#capacity;
            return;
        }

        if (index === (this.#back - 1 + this.#capacity) % this.#capacity) {
            return this.pop();
        }

        // move all the things after the index one step forward
        for (let i = index, j = (i + 1) % this.#capacity; j != this.#back; i = j, j = (j + 1) % this.#capacity) {
            this.#elements[i] = this.#elements[j];
        }
        this.#elements[(this.#back - 1 + this.#capacity) % this.#capacity] = null;
        this.#length--;
        return item;
    }
}


export function getAllServers(ns: NS, root: string) {
    const visited: string[] = [];
    const stack: string[] = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (visited.includes(current)) {
            continue;
        }
        visited.push(current);
        stack.push(...ns.scan(current));
    }
    return visited;
}