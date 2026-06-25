import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const { default: en } = await import(pathToFileURL(path.join(root, 'src/locales/en.ts')).href);

function flatten(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(p); // parent paths resolve to objects in t()
      keys.push(...flatten(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

const enKeys = new Set(flatten(en));

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (f === '__tests__' || f === 'node_modules') continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(f)) out.push(p);
  }
  return out;
}

const tKeyRe = /(?<![.\w])t\(\s*['`]([a-z][a-zA-Z0-9_.]*)['`]/g;
const usedKeys = new Set();

for (const file of walk(path.join(root, 'src'))) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = tKeyRe.exec(content))) usedKeys.add(m[1]);
}

const missing = [...usedKeys]
  .filter((k) => !enKeys.has(k) && !k.startsWith('this.') && !k.startsWith('totally.') && !k.startsWith('brand.nonexistent.'))
  .sort();
console.log(`Used: ${usedKeys.size}, Defined: ${enKeys.size}, Missing: ${missing.length}`);
for (const k of missing) console.log(k);
