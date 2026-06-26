// Section-level diff algorithm for admin support pipeline doc review.

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: number;
}

export interface SectionDiff {
  sectionKey: string;
  heading: string;
  oldContent: string;
  newContent: string;
  lines: DiffLine[];
  hasChanges: boolean;
  isLocked: boolean;
  lockedBy?: string;
}

// ── LCS-based word diff ───────────────────────────────────────────────────────

/**
 * Computes a word-level diff between oldText and newText using Longest Common
 * Subsequence (LCS). Words are split on whitespace boundaries.
 * Line numbers track position in the output sequence (1-based).
 */
export function diffContent(oldText: string, newText: string): DiffLine[] {
  const oldWords = oldText.split(/\s+/).filter((w) => w.length > 0);
  const newWords = newText.split(/\s+/).filter((w) => w.length > 0);

  const m = oldWords.length;
  const n = newWords.length;

  // Build LCS table (m+1) × (n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff operations
  const ops: Array<{ type: 'added' | 'removed' | 'unchanged'; word: string }> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      ops.push({ type: 'unchanged', word: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'added', word: newWords[j - 1] });
      j--;
    } else {
      ops.push({ type: 'removed', word: oldWords[i - 1] });
      i--;
    }
  }

  ops.reverse();

  // Convert word operations to DiffLine[], one word per line, with 1-based lineNumbers
  const lines: DiffLine[] = ops.map((op, idx) => ({
    type: op.type,
    content: op.word,
    lineNumber: idx + 1,
  }));

  return lines;
}

// ── Section-level diff ────────────────────────────────────────────────────────

export interface DocSection {
  key: string;
  heading: string;
  content: string;
}

export interface SectionLock {
  sectionKey: string;
  lockedBy: string;
}

/**
 * Matches sections by key between oldSections and newSections, computes a
 * per-section word diff, and attaches lock metadata.
 *
 * - Sections only in new → all words marked "added"
 * - Sections only in old → all words marked "removed"
 * - Matched sections → run diffContent on their content
 */
export function diffDocSections(
  oldSections: DocSection[],
  newSections: DocSection[],
  locks: SectionLock[],
): SectionDiff[] {
  const oldMap = new Map<string, DocSection>(oldSections.map((s) => [s.key, s]));
  const newMap = new Map<string, DocSection>(newSections.map((s) => [s.key, s]));
  const lockMap = new Map<string, string>(locks.map((l) => [l.sectionKey, l.lockedBy]));

  const results: SectionDiff[] = [];

  // Process all sections that appear in newSections (added or matched)
  for (const newSec of newSections) {
    const oldSec = oldMap.get(newSec.key);
    const lockedBy = lockMap.get(newSec.key);

    if (!oldSec) {
      // New section — all words are added
      const words = newSec.content.split(/\s+/).filter((w) => w.length > 0);
      const lines: DiffLine[] = words.map((w, idx) => ({
        type: 'added' as const,
        content: w,
        lineNumber: idx + 1,
      }));
      results.push({
        sectionKey: newSec.key,
        heading: newSec.heading,
        oldContent: '',
        newContent: newSec.content,
        lines,
        hasChanges: words.length > 0,
        isLocked: lockedBy !== undefined,
        lockedBy,
      });
    } else {
      // Matched section — run word diff
      const lines = diffContent(oldSec.content, newSec.content);
      const hasChanges = lines.some((l) => l.type !== 'unchanged');
      results.push({
        sectionKey: newSec.key,
        heading: newSec.heading,
        oldContent: oldSec.content,
        newContent: newSec.content,
        lines,
        hasChanges,
        isLocked: lockedBy !== undefined,
        lockedBy,
      });
    }
  }

  // Process sections only in old (removed)
  for (const oldSec of oldSections) {
    if (!newMap.has(oldSec.key)) {
      const lockedBy = lockMap.get(oldSec.key);
      const words = oldSec.content.split(/\s+/).filter((w) => w.length > 0);
      const lines: DiffLine[] = words.map((w, idx) => ({
        type: 'removed' as const,
        content: w,
        lineNumber: idx + 1,
      }));
      results.push({
        sectionKey: oldSec.key,
        heading: oldSec.heading,
        oldContent: oldSec.content,
        newContent: '',
        lines,
        hasChanges: words.length > 0,
        isLocked: lockedBy !== undefined,
        lockedBy,
      });
    }
  }

  return results;
}

// ── Diff statistics ───────────────────────────────────────────────────────────

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
  lockedCount: number;
}

/**
 * Counts line types across all section diffs and the number of locked sections.
 */
export function diffStats(diffs: SectionDiff[]): DiffStats {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  let lockedCount = 0;

  for (const diff of diffs) {
    if (diff.isLocked) lockedCount++;
    for (const line of diff.lines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
      else unchanged++;
    }
  }

  return { added, removed, unchanged, lockedCount };
}
