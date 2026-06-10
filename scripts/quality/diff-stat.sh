#!/usr/bin/env bash
# {"filesChanged":N,"linesChanged":M}  $1=workdir (a git repo)
set -uo pipefail; cd "$1" || exit 2
files=$(git diff --name-only 2>/dev/null | grep -c . || echo 0)
lines=$(git diff --numstat 2>/dev/null | awk '{a+=$1+$2} END{print a+0}')
echo "{\"filesChanged\":${files:-0},\"linesChanged\":${lines:-0}}"
