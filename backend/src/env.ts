/**
 * Environment variable loader — must be imported BEFORE any module that reads process.env.
 * Loads root .env first (shared secrets), then backend/.env for local overrides.
 * First-loaded value wins, so root .env sets authoritative shared values.
 */
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // backend/.env (CWD = backend/ when run via npm start)

export {};
