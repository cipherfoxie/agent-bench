#!/usr/bin/env bash
# proxy: type-clean. $1=workdir
set -uo pipefail; cd "$1" || exit 2
npx --no-install tsc --noEmit >/dev/null 2>&1 || npx tsc --noEmit >/dev/null 2>&1 && echo LINT_CLEAN || { echo LINT_DIRTY; exit 1; }
