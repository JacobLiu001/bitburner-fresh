export interface IDable {
    id: string;
}

export interface Job extends IDable {
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
}

export type Block = { server: string; ram: number; maxRam: number; };
export interface RAMCluster {
    unusedRam: number;
    maxRam: number;
    maxBlockSize: number;
    update(ns: NS, servers: string[]): void;
    getBlock(server: string): Block;
    assign(job: Job): boolean;
    free(job: Job): void;
    printBlocks(ns: NS, alsoPrintToTerminal?: boolean): void;
    getBlocksClone(): Block[];
    allocateBatches(ns: NS, threadCosts: number[]): number;
}

export interface TargetProfile {
    target: string;
    maxMoney: number;
    minSecurity: number;
    batches: number;
    hackRatio: number;
    money: number;
    security: number;
    hackChance: number;
    weakenTime: number;
    delay: number;
    spacer: number; // miliseconds
    nextBatchEnd: number;
    times: { hack: number, weaken1: number, grow: number, weaken2: number; };
    end: number;
    threads: { hack: number, weaken1: number, grow: number, weaken2: number; };
    mode: "RAM restricted" | "Timing restricted";

    update(ns: NS): void;
}