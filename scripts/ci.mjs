/**
 * Local CI — mirrors .github/workflows/ci.yml so `npm run ci` predicts GitHub push/PR success.
 *
 * Usage:
 *   npm run ci              # full suite (also runs automatically on git push)
 *   npm run ci -- --quick   # backend tests + frontend lint/typecheck/test (no coverage/build)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');

function run(label, cmd, args, opts = {}) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

function npm(script, cwd, extraArgs = []) {
  const args = ['run', script, ...extraArgs];
  return run(`${cwd.replace(`${ROOT}/`, '')}: npm ${args.join(' ')}`, 'npm', args, { cwd });
}

function npx(label, args, cwd) {
  return run(label, 'npx', args, { cwd });
}

// Match root pretest — vitest 4 needs Node 22 (styleText in node:util).
const [maj] = process.versions.node.split('.').map(Number);
if (maj < 22) {
  console.error(`\n✗ Node ${process.version} detected. CI requires Node >=22.`);
  console.error('  Run: nvm use 22\n');
  process.exit(1);
}

console.log('Experient local CI — mirrors GitHub Actions (ci.yml)');
console.log(`Node ${process.version}${QUICK ? ' · quick mode' : ''}`);

if (!existsSync(resolve(ROOT, 'backend/node_modules'))) {
  console.error('\n✗ backend/node_modules missing. Run: npm run install:all\n');
  process.exit(1);
}
if (!existsSync(resolve(ROOT, 'app/node_modules'))) {
  console.error('\n✗ app/node_modules missing. Run: npm run install:all\n');
  process.exit(1);
}

// ── Backend (ci.yml: syntax · test) ───────────────────────────────────────────
run(
  'backend: syntax check',
  'sh',
  ['-c', 'find src -name "*.js" | xargs node --check'],
  { cwd: resolve(ROOT, 'backend') },
);
npm('test', resolve(ROOT, 'backend'));

// ── Frontend (ci.yml: lint · typecheck · test:coverage · build:app) ───────────
const appDir = resolve(ROOT, 'app');
npm('lint', appDir);
npx('app: typecheck', ['tsc', '--noEmit'], appDir);

if (QUICK) {
  npm('test', appDir);
} else {
  npm('test:coverage', appDir);
  npm('build:app', appDir);
}

console.log('\n✓ Local CI passed — GitHub push/PR checks should succeed.\n');
