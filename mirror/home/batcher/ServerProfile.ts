import {
    isPrepped,
    preFormulasThreadCalc
} from "./utils";

import { TargetProfile as ITargetProfile } from "./typedefs";

export class TargetProfile implements ITargetProfile {
    readonly target: string;
    readonly maxMoney: number;
    readonly minSecurity: number;

    batches: number; // number of batches to run. An optimizer will set this.
    hackRatio: number = 0.001; // ratio of money to hack.

    // these change over time
    money: number;
    security: number;
    hackChance: number;
    weakenTime: number;
    nextBatchEnd: number;

    // dynamically adjusted values
    delay: number;
    spacer: number; // miliseconds
    times: { hack: number, weaken1: number, grow: number, weaken2: number; };
    end: number;
    threads: { hack: number, weaken1: number, grow: number, weaken2: number; };
    mode: "RAM restricted" | "Timing restricted" = "RAM restricted";

    constructor(ns: NS, server: string) {
        this.target = server;
        this.maxMoney = ns.getServerMaxMoney(server);
        this.minSecurity = ns.getServerMinSecurityLevel(server);

        this.weakenTime = ns.getWeakenTime(this.target);
        this.delay = 0;
        this.spacer = 5;
        this.end = Date.now() + this.spacer + this.weakenTime;

        this.update(ns);
    }

    update(ns: NS) {
        this.money = ns.getServerMoneyAvailable(this.target);
        this.security = ns.getServerSecurityLevel(this.target);
        this.hackChance = ns.hackAnalyzeChance(this.target);
        this.weakenTime = ns.getWeakenTime(this.target);
        this.nextBatchEnd = this.end + this.weakenTime + this.spacer;
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
    }

    toString(): string {
        // dump everything for debugging
        return JSON.stringify(this, null, 4);
    }
}