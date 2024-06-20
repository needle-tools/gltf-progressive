import { copyFileSync, existsSync, mkdir, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
/**
 * @param {{version:string}} packagejson
 */
export function updateVersion(packagejson) {
    console.log("Update version to " + packagejson.version);
    const path = "dist/lib/version.js";
    const content = readFileSync(path, "utf-8");
    const newContent = content.replace(/export const version = ".*";/, `export const version = "${packagejson.version}";`);
    writeFileSync(path, newContent);
}


export function postprocessExamples() {
    const path = "dist/examples";
    const files = collectFilesRecursive(path, []);
    for (const file of files) {
        if (file.endsWith(".html")) {
            console.log("Postprocess " + file);
            const content = readFileSync(file, "utf-8");
            const newContent = content.replace(/src="..\/dist\/lib\/index.js"/, 'src="https://www.unpkg.com/@needle-tools/gltf-progressive@latest"');
            writeFileSync(file, newContent);
        }
    }
}


/**
 * @param {string} dir
 * @param {string[]} arr
 * @returns {string[]}
 */
export function collectFilesRecursive(dir, arr) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (entry.name === "node_modules")
                continue;
            collectFilesRecursive(dir + "/" + entry.name, arr);
        }
        else {
            arr.push(dir + "/" + entry.name);
        }
    }
    return arr;
}


export function copyRecursive(src, dest) {
    const entries = readdirSync(src, { withFileTypes: true });

    for (const file of entries) {
        // ignore node_modules
        if (file.name === "node_modules")
            continue;
        if (file.isDirectory()) {
            const target = join(dest, file.name);
            if (!existsSync(target))
                mkdirSync(target);
            copyRecursive(join(src, file.name), target);
        }
        else {
            mkdirSync(dest, { recursive: true });
            const target = join(dest, file.name);
            if (existsSync(target)) {
                rmSync(target);
            }
            copyFileSync(join(src, file.name), target);
        }
    }

}