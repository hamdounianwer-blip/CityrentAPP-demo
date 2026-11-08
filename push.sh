#!/usr/bin/env bash
# Usage: ./push.sh https://github.com/<user>/<repo>.git
set -e
[ -z "$1" ] && { echo "Usage: ./push.sh <url-du-repo>"; exit 1; }
rm -f push.sh.bak
git init -q -b main 2>/dev/null || git init -q
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-cityrent}" -c user.email="${GIT_AUTHOR_EMAIL:-demo@cityrent.local}" commit -qm "CityRent demo" || true
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$1"
git push -u origin main
echo "Ensuite: GitHub > Settings > Pages > Source: Deploy from a branch > main / (root)"
