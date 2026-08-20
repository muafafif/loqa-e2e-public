#!/usr/bin/env node
// CI helper: patches src-tauri/tauri.conf.json before cargo tauri build.
// Usage: node patch-conf.js <binary-name>
//   binary-name: platform-specific backend binary (e.g. loqa-work-backend or loqa-work-backend.exe)
const fs = require("fs");
const binary = process.argv[2];
if (!binary) { console.error("Usage: node patch-conf.js <binary-name>"); process.exit(1); }
const p = "src-tauri/tauri.conf.json";
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.build.beforeBuildCommand = "";
c.tauri.bundle.resources = [binary];
fs.writeFileSync(p, JSON.stringify(c, null, 2));
console.log(`Patched ${p}: beforeBuildCommand cleared, resources=[${binary}]`);
