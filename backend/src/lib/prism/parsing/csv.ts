/**
 * Prism — RFC-4180-style CSV tokenizer (no new deps; native string scan).
 *
 * This is the LOW level of the file-dialect framework: it turns raw CSV text into a
 * grid of string rows (`string[][]`) WITHOUT making any assumptions about which row is
 * the header or what the columns mean. Header/field semantics live one layer up, in the
 * dialect layer (`./dialects`), because real-world exports disagree about that (Qualtrics
 * has THREE leading header/metadata rows; a plain CSV has one).
 *
 * What it handles (the "many real-world export dialects" surface):
 *  - Quoted fields, escaped quotes (`""` → `"`), commas + embedded newlines inside quotes.
 *  - CRLF / LF / lone-CR line endings.
 *  - A UTF-8 BOM at the very start (stripped).
 *  - A leading Excel `sep=,` hint line (consumed; sets the delimiter).
 *  - Delimiter auto-sniff (`,` `;` `\t` `|`) from the first non-empty, non-`sep=` line when
 *    no explicit hint is given.
 *  - Ragged rows are returned verbatim (the dialect layer pads/truncates to the header).
 *
 * It NEVER throws on malformed content — a stray quote just keeps the scanner in/out of a
 * quoted field; the worst case is a slightly mis-split row, never a crash. Empty input → `[]`.
 */

const CANDIDATE_DELIMS = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof CANDIDATE_DELIMS)[number];

export interface TokenizeResult {
  /** The parsed grid. Outer = rows, inner = string cells (verbatim, never null). */
  rows: string[][];
  /** The delimiter actually used (from a `sep=` hint, an explicit option, or the sniff). */
  delimiter: Delimiter;
  /** True when a leading `sep=` hint line was found and consumed. */
  sepHint: boolean;
}

export interface TokenizeOpts {
  /** Force a delimiter (skips sniffing + `sep=` parsing). */
  delimiter?: Delimiter;
}

/** Strip a leading UTF-8 BOM if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Detect (and return the length of) a leading Excel `sep=` hint line, e.g. `sep=,` or
 * `sep=;` optionally followed by CR/LF. Returns null when the text doesn't start with one.
 */
function readSepHint(text: string): { delimiter: Delimiter; consumed: number } | null {
  // Case-insensitive `sep=` prefix, then a single delimiter char, then an EOL/EOF.
  const m = /^sep=(.)(\r\n|\r|\n|$)/i.exec(text);
  if (!m) return null;
  // Honor whatever single char Excel declared (commonly , ; or \t), even if not a sniff
  // candidate — the file literally tells us its delimiter.
  return { delimiter: m[1] as Delimiter, consumed: m[0].length };
}

/**
 * Sniff the most likely delimiter from the first non-empty line of `text`, honoring quotes
 * (a delimiter inside quotes doesn't count). Picks the candidate with the highest
 * out-of-quote count; ties resolve in CANDIDATE_DELIMS order (comma first). Defaults to ','.
 */
export function sniffDelimiter(text: string): Delimiter {
  // Find the first non-empty physical line (cheap; we only need the header line for a sniff).
  let line = '';
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if (raw.trim().length > 0) { line = raw; break; }
  }
  if (!line) return ',';

  const counts = new Map<Delimiter, number>();
  for (const d of CANDIDATE_DELIMS) counts.set(d, 0);
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { i++; continue; } // escaped quote
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if ((CANDIDATE_DELIMS as readonly string[]).includes(ch)) {
      counts.set(ch as Delimiter, (counts.get(ch as Delimiter) ?? 0) + 1);
    }
  }
  let best: Delimiter = ',';
  let bestCount = -1;
  for (const d of CANDIDATE_DELIMS) {
    const c = counts.get(d) ?? 0;
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}

/**
 * Tokenize CSV text into a grid of string rows. Pure + total: never throws, returns `[]`
 * for empty/whitespace-only input. The first non-empty row is NOT specially treated here —
 * the dialect layer decides header semantics.
 */
export function tokenizeCsv(input: string, opts: TokenizeOpts = {}): TokenizeResult {
  let text = stripBom(input ?? '');

  // 1) Leading `sep=` hint wins; else honor an explicit option; else sniff.
  let delimiter: Delimiter;
  let sepHint = false;
  const hint = readSepHint(text);
  if (hint) {
    delimiter = hint.delimiter;
    text = text.slice(hint.consumed);
    sepHint = true;
  } else if (opts.delimiter) {
    delimiter = opts.delimiter;
  } else {
    delimiter = sniffDelimiter(text);
  }

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let sawAnyChar = false; // distinguishes "" (one empty field) from genuinely no input
  let i = 0;

  const pushField = (): void => { row.push(field); field = ''; };
  const pushRow = (): void => { rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; sawAnyChar = true; i++; continue; }
    if (ch === delimiter) { pushField(); sawAnyChar = true; i++; continue; }
    // Line endings: CRLF, lone LF, lone CR all terminate a record.
    if (ch === '\r') {
      pushField(); pushRow();
      if (text[i + 1] === '\n') i += 2; else i++;
      sawAnyChar = false;
      continue;
    }
    if (ch === '\n') { pushField(); pushRow(); i++; sawAnyChar = false; continue; }
    field += ch; sawAnyChar = true; i++;
  }
  // Flush a trailing field/row (file with no terminating newline).
  if (field.length > 0 || row.length > 0 || sawAnyChar) { pushField(); pushRow(); }

  // Drop fully-empty trailing/intermediate lines (a single empty cell from a blank line).
  const cleaned = rows.filter((r) => !(r.length === 1 && r[0] === ''));

  return { rows: cleaned, delimiter, sepHint };
}
