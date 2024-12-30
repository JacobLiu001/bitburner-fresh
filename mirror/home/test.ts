import { preFormulasThreadCalc } from "./batcher/utils"

export async function main(ns: NS) {
    ns.tprint(ns.getWeakenTime("rho-construction") / 1000 / 60)
}