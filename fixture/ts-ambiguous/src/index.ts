import { registerUser1 } from './services/svc1.js';
import { audit1 } from './audit/aud1.js';
registerUser1({ id: 'a', name: 'A' });
audit1('hello');
