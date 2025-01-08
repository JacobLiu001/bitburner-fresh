export async function main(ns: NS) {
    return ns.hack(ns.args[0] as string);
}
