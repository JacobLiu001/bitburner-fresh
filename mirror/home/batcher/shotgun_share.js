/**
 * @param {NS} ns
 */
export async function main(ns) {
  const iters = ns.args[0];
  for (let i = 0; i < iters; i++) {
    await ns.share();
  }
}
