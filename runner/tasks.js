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
  // Chat family (caveman experiment): prose answers scored against frozen fact
  // checklists (regex, case-insensitive). success = ALL facts present in output.
  'chat-tcp': {
    name: 'chat-tcp', type: 'chat', fixture: `${ROOT}/fixture/chat`,
    prompt: 'Explain the TCP three-way handshake and name the three packet types involved.',
    checklist: [/\bSYN\b/i, /SYN[\/\s-]?ACK/i, /\bACK\b/i],
  },
  'chat-chmod': {
    name: 'chat-chmod', type: 'chat', fixture: `${ROOT}/fixture/chat`,
    prompt: 'What does chmod 750 mean? State the permissions for owner, group, and others.',
    checklist: [/rwx|read.{0,30}write.{0,30}execute/i, /r-x|read.{0,30}execute/i, /(other|world).{0,80}(no|none|nothing|0|keine)/i],
  },
  'chat-acid': {
    name: 'chat-acid', type: 'chat', fixture: `${ROOT}/fixture/chat`,
    prompt: 'Name the four ACID properties of database transactions and explain each in one sentence.',
    checklist: [/atomic/i, /consisten/i, /isolat/i, /durab/i],
  },
};
