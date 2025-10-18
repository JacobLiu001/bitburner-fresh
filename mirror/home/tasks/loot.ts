export async function main(ns: NS) {
  const SECURITY_THRESHOLD = 1; // 20 threads of weaken is 1 security level
  if (ns.self().server !== "home") {
    throw new Error(
      "This script must be run on home. I can't be bothered to make it work since it's only for bootstrapping."
    );
  }
  ns.exec("/tasks/root_all.ts", "home");
  await ns.sleep(1000); // save 0.1GB of RAM
  ns.exec("/tasks/write_all_servers.ts", "home");
  await ns.sleep(1000);
  const servers = JSON.parse(ns.read("/tmp/all_rooted.txt"));
  ns.exec(
    "/tasks/distribute_files.ts",
    "home",
    1,
    JSON.stringify(servers),
    JSON.stringify(["/batcher/dumb_hack.ts", "/batcher/dumb_weaken.ts"]),
    "home"
  );
  await ns.sleep(1000);
  const target: string = (ns.args[0] as string) ?? "foodnstuff";
  // do not grow, only hack and weaken
  while (true) {
    if (
      ns.getServerSecurityLevel(target) >
      ns.getServerMinSecurityLevel(target) + SECURITY_THRESHOLD
    ) {
      ns.print(`Weakening ${target}`);
      for (const server of servers) {
        const availRam =
          ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        const threads = Math.floor(availRam / 1.75);
        if (threads < 1) {
          continue;
        }
        ns.scp("/batcher/dumb_weaken.ts", server, "home");
        ns.exec("/batcher/dumb_weaken.ts", server, threads, target);
      }
      await ns.sleep(ns.getWeakenTime(target) + 150);
      continue;
    }
    if (ns.getServerMoneyAvailable(target) > 0) {
      ns.print(`Hacking ${target}`);
      for (const server of servers) {
        const availRam =
          ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
        const threads = Math.floor(availRam / 1.7);
        if (threads < 1) {
          continue;
        }
        ns.exec("/batcher/dumb_hack.ts", server, threads, target);
      }
      await ns.sleep(ns.getHackTime(target) + 150);
      continue;
    }
    break;
  }
}
