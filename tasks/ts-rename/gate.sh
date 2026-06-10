#!/usr/bin/env bash
# success iff addNumbers fully renamed to sum AND project type-checks. $1=workdir
set -uo pipefail; cd "$1" || exit 2
grep -rq 'addNumbers' src/ && { echo FAIL_OLDNAME; exit 1; }
grep -rqw 'sum' src/ || { echo FAIL_NONEWNAME; exit 1; }
npx --no-install tsc --noEmit >/dev/null 2>&1 || npx tsc --noEmit >/dev/null 2>&1 || { echo FAIL_TYPECHECK; exit 1; }
echo PASS
