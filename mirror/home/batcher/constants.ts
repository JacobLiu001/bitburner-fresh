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
