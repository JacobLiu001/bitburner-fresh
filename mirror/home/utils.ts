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

export async function testHack(ns: NS) {
    await ns.hack("joesguns");
}

/**
 * Get a port number for RAM dodger
 * @param ns
 * @param code The code expected to be run
 * @returns A (hopefully unique) port number to get the result to/from.
 */
function getCodePort(ns: NS, code: string): number {
    const RAM_DODGE_PORT_OFFSET = 10000000;
    const RAM_DODGE_PORT_MAX = RAM_DODGE_PORT_OFFSET + 256;
    const PRIME_TO_MOD_FIRST = 1000003; // to get better distribution? // TODO: get a mathematician to actually see if this is a good idea
    return RAM_DODGE_PORT_OFFSET + (hashString(code) % PRIME_TO_MOD_FIRST + PRIME_TO_MOD_FIRST) % (RAM_DODGE_PORT_MAX - RAM_DODGE_PORT_OFFSET);
}

/**
 * RAM dodging: Run code via a temporary script, and return the result
 * @param ns
 * @param code The code being run. Should have a serializable return value.
 * @param args The arguments to pass into the code
 * @param function The function with which to run the code. Should be either ns.run or ns.exec with the hostname curried.
 * @param imports An array of [module, functions] to import into the temporary script
 */
export async function getDataNewProcess(ns: NS, code: string, args: any[], fn: Function = ns.run, imports: [string, string[]][] = []): Promise<any> {
    const port = getCodePort(ns, code);
    const script = `
        ${imports.map(([module, functions]) => `import {${functions.join(", ")}} from "${module}";`).join("\n")}
        export async function main(ns) {
            let result = ${code};
            ns.writePort(${port}, result);
        }
    `;
    const filename = `/tmp/tmp-${port}.js`;
    ns.write(filename, script, "w");
    ns.clearPort(port);
    const pid = fn(filename, { temporary: true }, ...args);
    if (pid === 0) {
        ns.clearPort(port);
        log(ns, `Failed to run code: ${code}`, true, "error");
        return null;
    }
    await ns.nextPortWrite(port);
    const result = ns.readPort(port);
    return result;
}