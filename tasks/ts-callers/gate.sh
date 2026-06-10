#!/usr/bin/env bash
# success iff applyDiscount fully renamed to computeDiscount across all files AND typechecks. $1=workdir
set -uo pipefail; cd "$1" || exit 2
grep -rq 'applyDiscount' src/ && { echo FAIL_OLDNAME; exit 1; }
cnt=$(grep -rcw 'computeDiscount' src/ 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
[ "${cnt:-0}" -ge 25 ] || { echo "FAIL_NEWNAME_COUNT=$cnt"; exit 1; }
npx --no-install tsc --noEmit >/dev/null 2>&1 || npx tsc --noEmit >/dev/null 2>&1 || { echo FAIL_TYPECHECK; exit 1; }
echo PASS
