#!/usr/bin/env bash
# success iff ONLY UserRepository.save was renamed to persist (incl its callers),
# while Logger.save and its callers stay untouched, and it type-checks. $1=workdir
set -uo pipefail; cd "$1" || exit 2
# target class renamed
grep -q 'persist(' src/userRepository.ts || { echo FAIL_TARGET_NOT_RENAMED; exit 1; }
grep -q 'save(' src/userRepository.ts && { echo FAIL_SAVE_LEFT_IN_TARGET; exit 1; }
# target callers (services) updated
grep -rq 'save(' src/services/ && { echo FAIL_SERVICE_CALLER_NOT_UPDATED; exit 1; }
grep -rq 'persist(' src/services/ || { echo FAIL_SERVICE_NO_PERSIST; exit 1; }
# decoy class + callers MUST be untouched
grep -q 'save(' src/logger.ts || { echo FAIL_LOGGER_CLOBBERED; exit 1; }
grep -q 'persist' src/logger.ts && { echo FAIL_LOGGER_RENAMED; exit 1; }
grep -rq 'save(' src/audit/ || { echo FAIL_AUDIT_CLOBBERED; exit 1; }
grep -rq 'persist' src/audit/ && { echo FAIL_AUDIT_RENAMED; exit 1; }
# must still type-check
npx --no-install tsc --noEmit >/dev/null 2>&1 || npx tsc --noEmit >/dev/null 2>&1 || { echo FAIL_TYPECHECK; exit 1; }
echo PASS
