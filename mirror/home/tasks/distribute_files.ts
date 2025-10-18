export async function main(ns: NS) {
  const servers = JSON.parse(ns.args[0] as string);
  const files = JSON.parse(ns.args[1] as string);
  const source = (ns.args[2] as string) ?? "home";
  for (const server of servers) {
    ns.scp(files, server, source);
  }
}
