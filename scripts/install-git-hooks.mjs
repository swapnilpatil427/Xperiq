/**
 * Point this repo's git hooks at .githooks/ (pre-push runs npm run ci).
 * Invoked automatically via npm prepare after npm install at the repo root.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(resolve(ROOT, '.git'))) {
  // Shallow checkouts or npm install outside a clone — skip silently.
  process.exit(0);
}

const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
  cwd: ROOT,
  encoding: 'utf8',
});

const hooksPath = (current.stdout ?? '').trim();
if (hooksPath === '.githooks') {
  process.exit(0);
}

if (hooksPath && hooksPath !== '.githooks') {
  console.warn(
    `\n⚠  git core.hooksPath is already "${hooksPath}" — not overwriting.`,
  );
  console.warn('   To use Experient hooks: git config core.hooksPath .githooks\n');
  process.exit(0);
}

const set = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: ROOT,
  stdio: 'inherit',
});

if (set.status === 0) {
  console.log('✓ Git hooks installed (.githooks/pre-push → npm run ci)\n');
}

process.exit(set.status ?? 0);
