const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const q = {
  diff: `${ROOT}/scripts/quality/diff-stat.sh`,
  regression: `${ROOT}/scripts/quality/regression.sh`,
  lint: `${ROOT}/scripts/quality/lint-clean.sh`,
};

export const TASKS = {
  'ts-rename': {
    name: 'ts-rename',
    fixture: `${ROOT}/fixture/ts-rename`,
    prompt: 'Rename the function addNumbers to sum everywhere in this TypeScript project. The project must still type-check.',
    gate: `${ROOT}/tasks/ts-rename/gate.sh`,
    quality: q,
  },
  'ts-callers': {
    name: 'ts-callers',
    fixture: `${ROOT}/fixture/ts-callers`,
    prompt: 'Rename the function applyDiscount to computeDiscount everywhere in this TypeScript project (it is used across many files). The project must still type-check.',
    gate: `${ROOT}/tasks/ts-callers/gate.sh`,
    quality: q,
  },
  // The real Serena test: an ambiguous name. UserRepository.save and Logger.save
  // share a method name; only the former must be renamed. Naive text-replace
  // clobbers Logger (and still type-checks) — only a type-aware rename is correct.
  'ts-ambiguous': {
    name: 'ts-ambiguous',
    fixture: `${ROOT}/fixture/ts-ambiguous`,
    prompt: 'Rename the `save` method of the `UserRepository` class to `persist`, updating all of its call sites. The project must still type-check.',
    gate: `${ROOT}/tasks/ts-ambiguous/gate.sh`,
    quality: q,
  },
};
