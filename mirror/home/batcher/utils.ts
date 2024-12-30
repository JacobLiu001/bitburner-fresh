export function getAllServers(ns: NS, root: string) {
    const visited: string[] = [];
    const stack: string[] = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (visited.includes(current)) {
            continue;
        }
        visited.push(current);
        stack.push(...ns.scan(current));
    }
    return visited;
}

export function getAllServersAndDistribute(ns: NS, root: string, scripts_to_copy: string[]) {
    const servers = getAllServers(ns, root);
    for (const server of servers) {
        if (server === root) {
            continue;
        }
        if (!ns.scp(scripts_to_copy, server, root)) {
            throw new Error(`Failed to copy ${scripts_to_copy} to server ${server}`);
        }
    }
}
