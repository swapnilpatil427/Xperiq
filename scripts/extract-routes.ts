#!/usr/bin/env npx tsx
/**
 * extract-routes.ts
 * Scans backend/src/routes/ and extracts route metadata for doc generation.
 * Outputs one JSON artifact per route file to /tmp/doc-artifacts/routes/.
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteEndpoint {
  method: string;
  path: string;
  handlerComment?: string;
  schemaRef?: string;
}

interface RouteArtifact {
  docKey: string;
  title: string;
  category: 'api';
  sourceType: 'route-extract';
  sourceRef: string;
  content: string;
  endpoints: RouteEndpoint[];
}

// Capitalise and humanise a slug: 'cx-cases' -> 'Cx Cases'
function humanise(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Strip the 'Router' suffix from the filename to derive the API title.
function titleFromFile(filename: string): string {
  const base = filename.replace(/\.ts$/, '');
  return humanise(base) + ' API';
}

function docKeyFromFile(filename: string): string {
  const base = filename.replace(/\.ts$/, '');
  return `api/${base}`;
}

/**
 * Extract the leading block comment (/** ... * /) or // comment block
 * from the top of the file if one exists.
 */
function extractFileDocblock(content: string): string {
  const jsdocMatch = content.match(/^\/\*\*([\s\S]*?)\*\//);
  if (jsdocMatch) {
    return jsdocMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ');
  }
  // Leading // comments
  const lines = content.split('\n');
  const commentLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\/\/\s?(.*)/);
    if (m) {
      commentLines.push(m[1].trim());
    } else if (line.trim() === '') {
      if (commentLines.length > 0) break;
    } else {
      break;
    }
  }
  return commentLines.join(' ');
}

/**
 * Find comment lines immediately above a given character index in the source.
 */
function commentBefore(content: string, index: number): string {
  const before = content.slice(0, index);
  const lines = before.split('\n');
  const commentLines: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//')) {
      commentLines.unshift(trimmed.replace(/^\/\/\s?/, ''));
    } else if (trimmed === '') {
      // allow one blank line gap
      if (commentLines.length === 0) continue;
      break;
    } else {
      break;
    }
  }
  return commentLines.join(' ');
}

/**
 * Extract all import statements for schema files to surface Zod schema usage.
 */
function extractSchemaImports(content: string): string[] {
  const schemas: string[] = [];
  const importRe = /import\s+[^;]+from\s+['"]([^'"]*schemas[^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    schemas.push(m[1]);
  }
  // Also capture named imports from schema files
  const namedRe = /import\s+\{([^}]+)\}\s+from\s+['"][^'"]*schema[^'"]*['"]/g;
  while ((m = namedRe.exec(content)) !== null) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    schemas.push(...names);
  }
  return [...new Set(schemas)];
}

/**
 * Parse route file content and return a structured artifact.
 */
function extractFromRouteFile(filename: string, content: string): RouteArtifact {
  const docKey = docKeyFromFile(filename);
  const title = titleFromFile(filename);
  const sourceRef = `backend/src/routes/${filename}`;
  const fileDocblock = extractFileDocblock(content);

  const endpoints: RouteEndpoint[] = [];

  // Match router.METHOD('path', ...) patterns
  // Handles: router.get, router.post, router.put, router.delete, router.patch
  const routeRe =
    /router\.(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"` ]+)\2/g;
  let m: RegExpExecArray | null;

  while ((m = routeRe.exec(content)) !== null) {
    const method = m[1].toUpperCase();
    const routePath = m[3];
    const comment = commentBefore(content, m.index);

    // Look for a Zod schema reference near this route (within ~300 chars after match)
    const vicinity = content.slice(m.index, m.index + 400);
    const schemaMatch = vicinity.match(/validate\(\s*(\w+Schema)\s*\)/);

    endpoints.push({
      method,
      path: routePath,
      handlerComment: comment || undefined,
      schemaRef: schemaMatch ? schemaMatch[1] : undefined,
    });
  }

  const schemaImports = extractSchemaImports(content);

  // Build human-readable content string
  const lines: string[] = [];

  if (fileDocblock) {
    lines.push(fileDocblock);
    lines.push('');
  }

  lines.push(`## Endpoints`);
  lines.push('');

  if (endpoints.length === 0) {
    lines.push('No route handlers found.');
  } else {
    for (const ep of endpoints) {
      lines.push(`### ${ep.method} ${ep.path}`);
      if (ep.handlerComment) {
        lines.push(ep.handlerComment);
      }
      if (ep.schemaRef) {
        lines.push(`Request validated with: \`${ep.schemaRef}\``);
      }
      lines.push('');
    }
  }

  if (schemaImports.length > 0) {
    lines.push(`## Schemas referenced`);
    lines.push('');
    for (const s of schemaImports) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  return {
    docKey,
    title,
    category: 'api',
    sourceType: 'route-extract',
    sourceRef,
    content: lines.join('\n'),
    endpoints,
  };
}

async function main(): Promise<void> {
  const routesDir = path.join(__dirname, '../backend/src/routes');
  const outputDir = '/tmp/doc-artifacts/routes';
  fs.mkdirSync(outputDir, { recursive: true });

  const entries = fs.readdirSync(routesDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.startsWith('_'))
    .map((e) => e.name);

  // Also handle nested dirs (e.g. routes/webhooks/)
  const nestedFiles: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(routesDir, entry.name);
      const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name.endsWith('.ts') && !sub.name.startsWith('_')) {
          nestedFiles.push(`${entry.name}/${sub.name}`);
        }
      }
    }
  }

  const allFiles = [...files, ...nestedFiles];

  for (const file of allFiles) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
    const artifact = extractFromRouteFile(file, content);
    const outputName = file.replace(/\//g, '__').replace('.ts', '.json');
    fs.writeFileSync(
      path.join(outputDir, outputName),
      JSON.stringify(artifact, null, 2)
    );
    console.log(`✓ ${artifact.docKey} (${artifact.endpoints.length} endpoints)`);
  }

  console.log(`\nExtracted ${allFiles.length} route artifacts`);
}

main().catch((err) => {
  console.error('extract-routes failed:', err);
  process.exit(1);
});
