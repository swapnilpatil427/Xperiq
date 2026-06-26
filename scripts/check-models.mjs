/**
 * Validates all OpenRouter model IDs in crystalos/lib/models.py before dev/start.
 *
 * Runs validate_all_model_configs() via the crystalos venv.
 * Exits 1 (blocking npm run dev/start) if any model ID is not in KNOWN_OPENROUTER_MODELS.
 * Skips gracefully if the venv hasn't been set up yet (run: npm run setup:agents).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = resolve(ROOT, 'crystalos/.venv/bin/python');

if (!existsSync(PYTHON)) {
  console.warn('\n⚠  crystalos/.venv not found — skipping model ID check.');
  console.warn('   Run  npm run setup:agents  to install the Python venv.\n');
  process.exit(0);
}

const result = spawnSync(
  PYTHON,
  ['-c', [
    'from crystalos.lib.models import validate_all_model_configs',
    'validate_all_model_configs()',
    "print('\\n✓ All OpenRouter model IDs verified')",
  ].join('; ')],
  {
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: ROOT },
    encoding: 'utf8',
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status !== 0) {
  console.error('\n✗ Invalid OpenRouter model ID(s) detected.');
  console.error('  Add the model to KNOWN_OPENROUTER_MODELS in crystalos/lib/models.py');
  console.error('  after verifying the exact slug at https://openrouter.ai/models\n');
  process.exit(1);
}
