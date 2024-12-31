/** 
 * Helper to log a message, and optionally also tprint it and toast it
 * @param {NS} ns The netscript instance passed to your script's main entry point
 * @param {string} message The message to display
 * @param {boolean} alsoPrintToTerminal Set to true to print not only to the current script's tail file, but to the terminal
 * @param {""|"success"|"warning"|"error"|"info"} toastStyle - If specified, your log will will also become a toast notification
 * @param {number} maxToastLength The maximum number of characters displayed in the toast */
export function log(ns: NS, message: string = "", alsoPrintToTerminal: boolean = false, toastStyle: "" | "success" | "warning" | "error" | "info" = "", maxToastLength: number = 100) {
    ns.print(message);
    if (toastStyle) {
        const toastMessage = message.length <= maxToastLength ? message : message.substring(0, maxToastLength - 3) + "...";
        ns.toast(toastMessage, toastStyle);
    }
    if (alsoPrintToTerminal) {
        ns.tprint(message);
    }
    return message;
}

/**
 * A simple hash function for strings, mainly used for generating unique numbers for RAM dodging scripts.
 * @param s String to be hashed
 * @returns a hash
 */
export function hashString(s: string) {
    let hash = 0;
    if (s.length == 0) return hash;
    for (let i = 0; i < s.length; i++) {
        let char = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32-bit integer?
    }
    return hash;
}

/**
 * RAM dodging: Run code via a temporary script, and return the result
 * @param ns
 * @param code The code being run. Should have a serializable return value.
 * @param args The arguments to pass into the code
 * @param function The function with which to run the code. Should be either ns.run or ns.exec with the hostname curried.
 * @param imports An array of [module, functions] to import into the temporary script
 */
export async function getDataNewProcess(ns: NS, code: string, args: any[], fn: Function, imports: [string, string[]][] = []): Promise<any> {
    const script = `
        ${imports.map(([module, functions]) => `import {${functions.join(", ")}} from "${module}";`).join("\n")}
        export async function main(ns) {
            let args = await ns.readPort(ns.pid);
            let result = ${code};
            ns.writePort(ns.pid, result);
        }
    `;
    const filename = `/tmp/tmp-${ns.pid}.js`;
    ns.write(filename, script, "w");
    const pid = fn(filename, { temporary: true });
    if (pid === 0) {
        log(ns, `Failed to run code: ${code}`, true, "error");
        return null;
    }
    const port = pid;
    ns.clearPort(port);
    ns.writePort(port, args);
    await ns.nextPortWrite(port);
    const result = ns.readPort(port);
    return result;
}

const SUFFIXES = ["", "k", "m", "b", "t", "q", "Q", "s", "S", "o", "n", "e33", "e36", "e39"];

export function parseNumber(input: number | string, binary: boolean = false): number {
    if (typeof input === "number") {
        return input;
    }
    if (SUFFIXES.includes(input.slice(-1))) {
        const suffix = input.slice(-1);
        const num = input.slice(0, -1);
        const mult = binary ? (1 << (SUFFIXES.indexOf(suffix) * 10)) : Math.pow(10, SUFFIXES.indexOf(suffix) * 3);
        return parseFloat(num) * mult;
    }
    if (SUFFIXES.includes(input.slice(-3))) {
        const suffix = input.slice(-3);
        const num = input.slice(0, -3);
        return parseFloat(num) * Math.pow(10, SUFFIXES.indexOf(suffix) * 3);
    }
    return parseFloat(input);
}

export function prettyPrintNumber(n: number, binary: boolean = false): string {
    let i = 0;
    while (n >= (binary ? 1024 : 1000) && i < SUFFIXES.length - 1) {
        n /= binary ? 1024 : 1000;
        i++;
    }
    return n.toFixed(2) + SUFFIXES[i];
}