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
};
