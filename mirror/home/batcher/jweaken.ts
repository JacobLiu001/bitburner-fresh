import { Job } from "./typedefs";

export async function main(ns: NS) {
    const start = performance.now();
    const port = ns.getPortHandle(ns.pid); // We have to define this here. You'll see why in a moment.
    const job: Job = JSON.parse(ns.args[0] as string);
    let tDelay = 0;
    let delay = job.end - job.time - Date.now();

    // Don't report delay right away.
    if (delay < 0) {
        ns.tprint(`WARN: Batch ${job.batch} ${job.type} was ${-delay}ms late. (${job.end})\n`);
        tDelay = -delay;
        delay = 0;
    }

    // The actual function call can take some time, so instead of awaiting on it right away, we save the promise for later.
    const promise = ns.weaken(job.target, { additionalMsec: delay });

    // Then after calling the hack function, we calculate our final delay and report it to the controller.
    tDelay += performance.now() - start;

    // The ns object is tied up by the promise, so invoking it now would cause a concurrency error.
    // That's why we fetched this handle earlier.
    port.write(tDelay);

    // Then we finally await the promise. This should give millisecond-accurate predictions for the end time of a job.
    await promise;

    if (job.report) {
        ns.writePort(job.port, job.id);
    }
}