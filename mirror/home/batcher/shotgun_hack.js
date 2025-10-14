export let main = (ns, a = ns.args) => a[0] && ns.hack(a[0], { additionalMsec: a[1] });
