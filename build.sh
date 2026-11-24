#!/usr/bin/env bash
# src/ と manifests/<browser>.json から dist/<browser>/ と dist/<browser>.zip を作る
set -euo pipefail

cd "$(dirname "$0")"

# アイコン PNG を SVG から生成（rsvg-convert があり、PNG が古い/無い場合のみ）
if command -v rsvg-convert >/dev/null 2>&1; then
  for size in 16 32 48 128; do
    png="src/icons/icon${size}.png"
    if [[ ! -f "$png" || src/icons/icon.svg -nt "$png" ]]; then
      rsvg-convert -w "$size" -h "$size" src/icons/icon.svg -o "$png"
    fi
  done
fi

for browser in chrome firefox; do
  out="dist/${browser}"
  rm -rf "$out" "dist/${browser}.zip"
  mkdir -p "$out/icons"
  cp src/content.js src/content.css src/popup.html src/popup.css src/popup.js "$out/"
  cp src/icons/icon*.png "$out/icons/"
  cp "manifests/${browser}.json" "$out/manifest.json"
  (cd "$out" && python3 -m zipfile -c "../${browser}.zip" manifest.json *.js *.css *.html icons)
  echo "built: $out  ($out.zip)"
done
