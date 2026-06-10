import { Logger } from '../logger.js';
export function audit2(msg: string): void {
  const log = new Logger();
  log.save(msg);
}
