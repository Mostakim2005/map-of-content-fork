import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const versions = JSON.parse(fs.readFileSync(path.join(root, "versions.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (pkg.version !== manifest.version) throw new Error(`package.json version ${pkg.version} != manifest ${manifest.version}`);
if (!versions[manifest.version]) throw new Error(`versions.json has no ${manifest.version} entry`);
if (!fs.existsSync(path.join(root, "main.js"))) throw new Error("main.js was not produced by the build");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
if (!main.trim()) throw new Error("main.js is empty");
console.log(`Plugin ${manifest.id} ${manifest.version}: bundle and release metadata are valid.`);
