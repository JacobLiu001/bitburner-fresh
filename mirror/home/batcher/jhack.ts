interface Job {
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

export async function main(ns: NS) {
    const start = performance.now();
    const port = ns.getPortHandle(ns.pid);
    const job: Job = JSON.parse(ns.args[0] as string);
    let tDelay = 0;
    let delay = job.end - job.time - Date.now();

    if (delay < 0) {
        ns.tprint(`WARN: Batch ${job.batch} ${job.type} was ${-delay}ms late. (${job.end})\n`);
        tDelay = -delay;
        delay = 0;
    }

    const promise = ns.hack(job.target, { additionalMsec: delay });
    tDelay += performance.now() - start;
    port.write(tDelay);
    await promise;

    if (job.report) {
        ns.writePort(job.port, job.id);
    }
}