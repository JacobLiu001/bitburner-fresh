import { find_xpath_with_retry, click, setText } from "./webui";
import { getDataNewProcess, log } from "./utils";

/**
 * Copied from https://github.com/bitburner-official/bitburner-src/blob/dev/src/Casino/RNG.ts
 */
class WHRNG {
    s1 = 0;
    s2 = 0;
    s3 = 0;

    constructor(n: number) {
        this.s1 = this.s2 = this.s3 = (n / 1000) % 30000;
    }

    step() {
        this.s1 = (171 * this.s1) % 30269;
        this.s2 = (172 * this.s2) % 30307;
        this.s3 = (170 * this.s3) % 30323;
    }

    random() {
        this.step();
        return (this.s1 / 30269.0 + this.s2 / 30307.0 + this.s3 / 30323.0) % 1.0;
    }
}

async function scheduleByPort(ns: NS, portNum: number, f: Function) {
    await ns.nextPortWrite(portNum);
    f();
    await ns.sleep(10);
    ns.writePort(portNum, "done!");
    return 114514;
}

export async function main(ns: NS) {
    ns.tail();
    ns.enableLog("ALL");
    ns.disableLog("sleep");

    // Roulette: The roulette RNG is seeded with the current time
    // Exploit: Well... We can control time :P

    let t = new Date().getTime();
    let rng = new WHRNG(t);
    let spin = () => Math.floor(rng.random() * 37);
    let spins = Array.from(Array(1024), spin);
    let o = Date.prototype.getTime;
    Date.prototype.getTime = function () {
        return t;
    };
    ns.atExit(() => {
        Date.prototype.getTime = o;
    });

    const restoreTime = scheduleByPort(ns, ns.pid, () => {
        Date.prototype.getTime = o;
    });

    // now we navigate to the casino

    // first, go to Aevum
    if (ns.getPlayer().city != "Aevum") {
        let travelled = false;
        try {
            travelled = await getDataNewProcess(ns, "ns.singularity.travelToCity('Aevum')", [], ns.run, []);
        } catch { }
        if (!travelled) {
            log(ns, "Failed to travel to Aevum with singularity. Trying with UI.", true, "warning");
            // nav bar Travel button
            await click(ns, await find_xpath_with_retry(ns, "//div[@role='button' and ./div/p/text()='Travel']", false, 5));
            // Aevum button
            await click(ns, await find_xpath_with_retry(ns, "//span[contains(@class,'travel') and ./text()='A']", false, 5));
            if (ns.getPlayer().city != "Aevum") {
                // There might be a confirmation pop-up
                await click(ns, await find_xpath_with_retry(ns, "//button[p/text()='Travel']", false, 5));
            }
        }
        if (ns.getPlayer().city != "Aevum") {
            throw new Error("Failed to travel to Aevum.");
        } else {
            log(ns, "SUCCESS: Travelled to Aevum.");
        }
    }
    // now go to the casino
    try {
        // this is faster than SF4
        // Nav bar city button
        await click(ns, await find_xpath_with_retry(ns, "//div[(@role = 'button') and (contains(., 'City'))]", false, 15, "City button missing. Is your nav menu collapsed?"));
        // Casino button
        await click(ns, await find_xpath_with_retry(ns, "//span[@aria-label = 'Iker Molina Casino']", false, 15));
    } catch (e) {
        let success = false, err;
        try {
            success = await getDataNewProcess(ns, "ns.singularity.goToLocation('Iker Molina Casino')", [], ns.run, []);
        } catch (e) {
            err = e;
        }
        if (!success) {
            throw new Error(`Failed to navigate to the casino. ${err}`);
        }
    }
    // now use the roulette
    await click(ns, await find_xpath_with_retry(ns, "//button[contains(text(), 'roulette')]", false, 15));

    const inputWager = await find_xpath_with_retry(ns, "//input[@type='number']", false, 15);
    const rouletteResult = await find_xpath_with_retry(ns, "//h4[contains(text(), '0')]", false, 15);

    const btnRoll: Node[] = [];
    for (let i = 0; i <= 36; i++) {
        const btn = await find_xpath_with_retry(ns, `//button[text()='${i}']`, false, 15);
        btnRoll.push(btn);
    }

    await ns.sleep(200);
    // signal to restore time now that it definitely finished seeding
    ns.writePort(ns.pid, 114514);
    await restoreTime;
    ns.clearPort(ns.pid);

    for (let i = 0; i < spins.length; i++) {
        let wager = "";
        const playerMoney = ns.getPlayer().money;
        if (playerMoney <= 1e7 + 1000) {
            wager = (playerMoney * 0.7).toString();
        } else {
            wager = "10000000";
        }
        await setText(ns, inputWager, wager);
        await click(ns, btnRoll[spins[i]]);
        await ns.sleep(1800); // the roulette takes 1.6s to spin
        if (ns.getMoneySources().sinceInstall.casino >= 1e10) {
            log(ns, "SUCCESS: Kicked out!", true, "success");
            return;
        }
        let ans = rouletteResult.textContent;
        if (["B", "R"].includes(ans[ans.length - 1])) {
            ans = ans.slice(0, -1);
        }
        if (ans == spins[i].toString()) {
            continue;
        }
        // we've desynced! look ahead 5 predictions at most
        log(ns, `DESYNC: Guess / Answer: ${btnRoll[spins[i]].textContent} / ${ans}`);
        let found = false;
        for (let j = i + 1; j < i + 5; j++) {
            if (ans == spins[j].toString()) {
                i = j;
                found = true;
                break;
            }
        }
        if (!found) {
            throw new Error("Failed to resync roulette.");
        }
    }
}