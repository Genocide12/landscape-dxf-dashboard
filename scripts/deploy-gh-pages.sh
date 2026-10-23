#!/usr/bin/env bash
# Деплой на GitHub: main (исходники) + gh-pages (статическая сборка из out/).
# Токен читается из ~/.ghtoken (вне репозитория!).
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="Genocide12/landscape-dxf-dashboard"
TOKEN="$(cat ~/.ghtoken)"
REMOTE="https://x-access-token:${TOKEN}@github.com/${REPO}.git"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")"

echo "[1/4] Проверка сборки out/"
if [ ! -f out/index.html ]; then
  echo "ОШИБКА: out/index.html не найден. Сначала запустите scripts/build-gh-pages.sh" >&2
  exit 1
fi

echo "[2/4] Коммит исходников (ветка ${BRANCH})"
git config user.name "Genocide12"
git config user.email "genocide12@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "  изменений нет"
else
  git commit -m "Обновление дашборда: $(date '+%Y-%m-%d %H:%M')"
fi
git push "$REMOTE" "${BRANCH}:main" 2>/dev/null || git push --force "$REMOTE" "${BRANCH}:main"
# затираем токен из вывода ошибок не требуется: remote задан per-command

echo "[3/4] Ветка gh-pages из out/"
TMP="$(mktemp -d)"
git clone -q "$REMOTE" "$TMP/repo"
cd "$TMP/repo"
git checkout -q --orphan gh-pages
git rm -rqf . 2>/dev/null || true
cp -r "$OLDPWD/out/." .
git add -A
git commit -qm "GitHub Pages build: $(date '+%Y-%m-%d %H:%M')"
# gh-pages — артефактная orphan-ветка: обычный пуш всегда non-fast-forward
git push -q --force origin gh-pages
cd - >/dev/null
rm -rf "$TMP"

echo "[4/4] Включение GitHub Pages (branch=gh-pages, dir=/)"
STATUS=$(curl -s -o /tmp/pages.json -w "%{http_code}" -X POST \
  -H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/pages" \
  -d '{"source":{"branch":"gh-pages","path":"/"}}')
if [ "$STATUS" = "201" ]; then
  echo "  Pages включён"
elif [ "$STATUS" = "409" ]; then
  echo "  Pages уже включён (обновится автоматически)"
else
  echo "  Внимание: код $STATUS"; cat /tmp/pages.json
fi

echo "Готово: https://genocide12.github.io/landscape-dxf-dashboard/"
