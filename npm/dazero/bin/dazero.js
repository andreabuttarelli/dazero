#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { platform, arch } = process;

const map = {
  "darwin-arm64": "@dazero/darwin-arm64",
  "darwin-x64": "@dazero/darwin-x64",
  "linux-x64": "@dazero/linux-x64",
  "linux-arm64": "@dazero/linux-arm64",
  "win32-x64": "@dazero/windows-x64",
};

const key = `${platform}-${arch}`;
const pkgName = map[key];
if (!pkgName) {
  console.error(`dazero: unsupported platform ${key}`);
  process.exit(1);
}

let binPath;
try {
  binPath = require.resolve(`${pkgName}/bin/dazero${platform === "win32" ? ".exe" : ""}`);
} catch {
  console.error(`dazero: the platform package '${pkgName}' is not installed.`);
  console.error("Try: npm i -g dazero --force  (or reinstall)");
  process.exit(1);
}

const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
