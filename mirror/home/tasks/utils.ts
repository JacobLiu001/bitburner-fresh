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