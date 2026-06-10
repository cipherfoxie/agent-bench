import type { User } from './types.js';
export class UserRepository {
  // persists a user to the store
  save(user: User): string { return `stored:${user.id}`; }
}
