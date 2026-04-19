#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version required, e.g. 0.1.0}"
TARGET="${2:?target required, e.g. aarch64-apple-darwin}"

case "$TARGET" in
  aarch64-apple-darwin)   PKG="darwin-arm64"; EXT="" ;;
  x86_64-apple-darwin)    PKG="darwin-x64";   EXT="" ;;
  x86_64-unknown-linux-gnu) PKG="linux-x64";  EXT="" ;;
  aarch64-unknown-linux-gnu) PKG="linux-arm64"; EXT="" ;;
  x86_64-pc-windows-msvc) PKG="windows-x64";  EXT=".exe" ;;
  *) echo "unknown target $TARGET"; exit 1 ;;
esac

mkdir -p "npm/platforms/$PKG/bin"
cp "target/$TARGET/release/dazero$EXT" "npm/platforms/$PKG/bin/"
# Imposta version nel package.json
node -e "
  const fs=require('fs');
  const p='npm/platforms/$PKG/package.json';
  const j=JSON.parse(fs.readFileSync(p));
  j.version='$VERSION';
  fs.writeFileSync(p, JSON.stringify(j,null,2));
"
echo "populated npm/platforms/$PKG"
