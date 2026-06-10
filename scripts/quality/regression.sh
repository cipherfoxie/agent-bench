#!/usr/bin/env bash
# full project still type-checks. $1=workdir
set -uo pipefail; cd "$1" || exit 2
npx --no-install tsc --noEmit >/dev/null 2>&1 || npx tsc --noEmit >/dev/null 2>&1 && echo NO_REGRESSION || { echo REGRESSION; exit 1; }
