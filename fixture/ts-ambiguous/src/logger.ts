export class Logger {
  // writes a log line; the word save also appears here as a string: "save"
  save(message: string): void { console.log(`log: ${message} (save)`); }
}
