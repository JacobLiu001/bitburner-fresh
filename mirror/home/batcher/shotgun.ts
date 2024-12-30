import { getAllServers } from "./utils";

const MAX_BATCHES = 50000;
const GROW_COMPENSATION = 1.01; // heath robinson growth compensation


function getOptimalTarget(ns: NS) {
    const hackLevel = ns.getHackingLevel();
    function getScore(server: Server) {
        const difficultyScale = (100 - server.minDifficulty) / (100 - server.hackDifficulty);
        const hackChanceAdjusted = Math.min(1,
            ns.hackAnalyzeChance(server.hostname) * difficultyScale
        );
        const hackPercentAdjusted = Math.min(1,
            ns.hackAnalyze(server.hostname) * difficultyScale
        );
        const timePenalty = (200 + server.requiredHackingSkill * server.minDifficulty) / (50 + hackLevel);
        const baseScore = server.moneyMax * hackChanceAdjusted * hackPercentAdjusted / timePenalty;

        if (server.hackDifficulty == server.minDifficulty && server.moneyAvailable >= 0.9 * server.moneyMax) {
            return baseScore * 2;
        }
        return baseScore;
    }
    if (hackLevel < 250) {
        // good xp ratio, good growth, earlygame king
        return "joesguns";
    }
    const servers = getAllServers(ns, "home").map(ns.getServer);
}


export async function main(ns: NS) {
    ns.disableLog('ALL');
    ns.tail();
    const dataPort = ns.getPortHandle(ns.pid);
    dataPort.clear();

    while (true) {

    }
}