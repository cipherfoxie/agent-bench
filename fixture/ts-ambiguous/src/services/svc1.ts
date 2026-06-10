import { UserRepository } from '../userRepository.js';
import type { User } from '../types.js';
export function registerUser1(u: User): string {
  const repo = new UserRepository();
  return repo.save(u);
}
