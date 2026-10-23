#!/usr/bin/env bash
# Статическая сборка для GitHub Pages:
# - выносит API-роуты (им нужен сервер)
# - подменяет next.config на export-версию с basePath и отдельным distDir
# - собирает в out/ и добавляет .nojekyll
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_PATH="${1:-/landscape-dxf-dashboard}"
DIST_DIR=".next-gh"
BACKUP_DIR=".build-backup"

echo "[1/5] Резервное копирование конфигурации и API"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp next.config.ts "$BACKUP_DIR/next.config.ts"
[ -d src/app/api ] && mv src/app/api "$BACKUP_DIR/api"

restore() {
  echo "[restore] Возврат конфигурации"
  [ -d "$BACKUP_DIR/api" ] && mv "$BACKUP_DIR/api" src/app/api
  cp "$BACKUP_DIR/next.config.ts" next.config.ts
  rm -rf "$BACKUP_DIR"
}
trap restore EXIT

echo "[2/5] Конфигурация static export (basePath=$BASE_PATH)"
cat > next.config.ts <<EOF
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "$DIST_DIR",
  basePath: "$BASE_PATH",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};

export default nextConfig;
EOF

echo "[3/5] Сборка (NEXT_PUBLIC_BASE_PATH=$BASE_PATH)"
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" bunx next build

echo "[4/5] Копирование экспорта в out/ и .nojekyll"
rm -rf out
cp -a "$DIST_DIR" out
touch out/.nojekyll

echo "[5/5] Готово: out/ ($(find out -type f | wc -l) файлов)"
