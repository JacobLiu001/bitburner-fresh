// This just grows a server. Used for prepping.

export async function main(ns: NS) {
    await ns.weaken(ns.args[0] as string);
}