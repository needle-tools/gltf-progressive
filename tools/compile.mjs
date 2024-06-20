import { readFileSync } from "fs";
import { copyRecursive, postprocessExamples, updateVersion } from "./utils.mjs";


run();
export function run() {
    const packageJsonPath = "package.json";
    const content = readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);
    updateVersion(packageJson);

    console.log("Copy examples");
    copyRecursive("examples", "dist/examples");
    postprocessExamples();
}