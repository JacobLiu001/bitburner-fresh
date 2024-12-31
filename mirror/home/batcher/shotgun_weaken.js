export let main = (ns, a = ns.args) => a[0] && ns.weaken(a[0]);
