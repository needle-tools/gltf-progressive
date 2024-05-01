import { execSync } from "child_process";
import { copyFileSync, existsSync, readFileSync, rmSync } from "fs";
import { copyFile, mkdir, rm, writeFile } from "fs/promises"


run();
async function run() {
    const isDryRun = process.argv?.includes("--dry-run");
    console.log("Begin building... " + (isDryRun ? "(dry run)" : ""));
    const outDir = process.cwd() + "/dist";
    if (existsSync(outDir))
        await rm(outDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    execSync("npm run build:dist", { cwd: process.cwd(), stdio: "inherit" });
    execSync("npm run build:lib", { cwd: process.cwd(), stdio: "inherit" });

    console.log("Copy & modify package.json")
    const outPackageJson = outDir + "/package.json";
    await copyFile("package.json", outPackageJson);
    const packageJson = JSON.parse(readFileSync(outPackageJson));
    delete packageJson.publishConfig;
    delete packageJson.scripts;
    delete packageJson.type;
    packageJson.main = "./lib/index.js"
    packageJson.types = "./lib/index.d.ts";
    packageJson.exports["."].import = "./lib/index.js"
    await writeFile(outPackageJson, JSON.stringify(packageJson, undefined, 2));

    // copy Readme and Changelog
    await copyFile("CHANGELOG.md", outDir + "/CHANGELOG.md");
    await copyFile("README.md", outDir + "/README.md");

    console.log("Finished building!");

    // copy npmignore
    copyFileSync(".npmignore", outDir + "/.npmignore");
    // publish to npm
    const cmd = isDryRun ? "npm publish --dry-run" : "npm publish";
    console.log("Begin publish..." + (isDryRun ? " (dry run)" : ""));
    console.log(`Directory: \"${outDir}\"`);
    execSync(cmd, { cwd: outDir, stdio: "inherit"});
    console.log("Finished publish!" + (isDryRun ? " (dry run)" : ""))
}


