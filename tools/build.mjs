import { execSync } from "child_process";
import { copyFileSync, existsSync, readFileSync } from "fs";
import { copyFile, mkdir, rm, writeFile } from "fs/promises"
import { copyRecursive, postprocessExamples, updateVersion } from "./utils.mjs";


run();
async function run() {
    const isDryRun = process.argv?.includes("--dry-run");
    console.log("Begin building... " + (isDryRun ? "(dry run)" : ""));
    const outDir = process.cwd() + "/dist";
    if (existsSync(outDir))
        await rm(outDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    execSync("npm run build:dist", { cwd: process.cwd(), stdio: "inherit" });
    const outPackageJson = outDir + "/package.json";
    await copyFile("package.json", outPackageJson);
    execSync("npm run build:lib", { cwd: process.cwd(), stdio: "inherit" });

    console.log("Modify package.json")
    const packageJson = JSON.parse(readFileSync(outPackageJson));
    delete packageJson.publishConfig;
    delete packageJson.scripts;
    packageJson.main = "./lib/index.js"
    packageJson.types = "./lib/index.d.ts";
    packageJson.exports["."].import = "./lib/index.js"
    await writeFile(outPackageJson, JSON.stringify(packageJson, undefined, 2));

    // copy Readme and Changelog
    await copyFile("CHANGELOG.md", outDir + "/CHANGELOG.md");
    await copyFile("README.md", outDir + "/README.md");

    // update version
    updateVersion(packageJson);

    console.log("Finished building!");

    // copy examples
    console.log("Copy examples...");
    copyRecursive("examples", outDir + "/examples");
    copyRecursive("NEEDLE_progressive", outDir + "/NEEDLE_progressive");
    postprocessExamples();
}

