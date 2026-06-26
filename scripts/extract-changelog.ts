#!/usr/bin/env npx tsx
/**
 * extract-changelog.ts
 * Extracts a structured changelog from the git log (last 30 commits).
 * Groups commits by day to create version entries, and by conventional commit prefix.
 * Outputs to /tmp/doc-artifacts/changelog.json.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type CommitType = 'feat' | 'fix' | 'chore' | 'docs' | 'refactor' | 'test' | 'style' | 'perf' | 'ci' | 'build' | 'other';

interface ChangelogChange {
  type: CommitType;
  title: string;
  description?: string;
  sha: string;
}

interface ChangelogEntry {
  version: string;
  releasedAt: string;
  summary: string;
  changes: ChangelogChange[];
  sourceSha: string;
}

interface RawCommit {
  sha: string;
  subject: string;
  authorDate: string;
}

const CONVENTIONAL_PREFIXES: CommitType[] = [
  'feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'style', 'perf', 'ci', 'build',
];

/**
 * Parse a conventional commit subject into type and title.
 * e.g. "feat(billing): add credit ledger" -> { type: 'feat', title: 'add credit ledger (billing)' }
 */
function parseConventionalCommit(subject: string): { type: CommitType; title: string } {
  for (const prefix of CONVENTIONAL_PREFIXES) {
    // Match: feat: title  OR  feat(scope): title
    const re = new RegExp(`^${prefix}(?:\\(([^)]+)\\))?[!]?:\\s*(.+)`, 'i');
    const m = subject.match(re);
    if (m) {
      const scope = m[1];
      const title = m[2].trim();
      return {
        type: prefix,
        title: scope ? `${title} (${scope})` : title,
      };
    }
  }
  // Merge commit or no prefix
  if (/^merge/i.test(subject)) {
    return { type: 'chore', title: subject };
  }
  return { type: 'other', title: subject };
}

/**
 * Format a date string (YYYY-MM-DD) into a date-based version string.
 * e.g. "2026-06-25" -> "2026.06.25"
 */
function dateToVersion(dateStr: string): string {
  return dateStr.replace(/-/g, '.');
}

/**
 * Get the first tag reachable from a sha, or null if none.
 */
function getTagForDate(dateStr: string): string | null {
  try {
    const tags = execSync(
      `git log --oneline --format="%D" --after="${dateStr} 23:59:59" --before="${dateStr} 23:59:59" 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    )
      .split('\n')
      .flatMap((l) => l.split(','))
      .map((s) => s.trim())
      .filter((s) => s.startsWith('tag: '))
      .map((s) => s.replace('tag: ', ''));
    return tags[0] ?? null;
  } catch {
    return null;
  }
}

function main(): void {
  const repoRoot = path.join(__dirname, '..');

  // Fetch last 30 commits: SHA | subject | author ISO date
  let gitOutput: string;
  try {
    gitOutput = execSync('git log --format="%H|%s|%aI" -30', {
      encoding: 'utf-8',
      cwd: repoRoot,
    });
  } catch (err) {
    console.error('Failed to run git log:', err);
    process.exit(1);
  }

  const rawCommits: RawCommit[] = gitOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, authorDate] = line.split('|');
      return { sha: sha.trim(), subject: subject.trim(), authorDate: authorDate.trim() };
    });

  if (rawCommits.length === 0) {
    console.log('No commits found.');
    const outputPath = '/tmp/doc-artifacts/changelog.json';
    fs.mkdirSync('/tmp/doc-artifacts', { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify([], null, 2));
    return;
  }

  // Group by calendar day (YYYY-MM-DD in UTC)
  const byDay = new Map<string, RawCommit[]>();
  for (const commit of rawCommits) {
    const day = commit.authorDate.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(commit);
  }

  // Sort days descending (newest first)
  const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  const entries: ChangelogEntry[] = [];

  for (const day of sortedDays) {
    const dayCommits = byDay.get(day)!;
    const changes: ChangelogChange[] = dayCommits.map((c) => {
      const { type, title } = parseConventionalCommit(c.subject);
      return { type, title, sha: c.sha };
    });

    // Filter out pure merge/bump chores for the summary
    const notable = changes.filter((c) => c.type !== 'chore' && c.type !== 'other');
    const summary =
      notable.length > 0
        ? notable.map((c) => c.title).join('; ')
        : changes.map((c) => c.title).join('; ');

    const tagName = getTagForDate(day);
    const version = tagName ?? dateToVersion(day);
    const releasedAt = dayCommits[0].authorDate;

    entries.push({
      version,
      releasedAt,
      summary,
      changes,
      sourceSha: dayCommits[0].sha,
    });
  }

  const outputPath = '/tmp/doc-artifacts/changelog.json';
  fs.mkdirSync('/tmp/doc-artifacts', { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));

  const totalChanges = entries.reduce((n, e) => n + e.changes.length, 0);
  console.log(`Extracted ${entries.length} changelog entries (${totalChanges} commits)`);
}

main();
