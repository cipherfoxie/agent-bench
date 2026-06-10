import { Logger } from '../logger.js';
export function audit3(msg: string): void {
  const log = new Logger();
  log.save(msg);
}
