import { Job as IJob, TargetProfile } from "./typedefs";
import { COSTS } from "./constants";

export class Job implements IJob {
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

    constructor(ns: NS, type: "hack" | "weaken1" | "grow" | "weaken2", profile: TargetProfile, batch: number) {
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