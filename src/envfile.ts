import * as fs from 'node:fs';
import type { EnvEntry } from './types.js';

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnv(content: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  const lines = content.split(/\r?\n/);
  let i = 0;
  let lastComment: string | undefined;

  const flushComment = () => {
    const c = lastComment;
    lastComment = undefined;
    return c;
  };

  while (i < lines.length) {
    const original = lines[i] ?? '';
    const line = original.replace(/^[\t ]*export[\t ]+/, '');
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }
    if (trimmed.startsWith('#')) {
      lastComment = trimmed.slice(1).trim();
      i++;
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    if (!KEY_RE.test(key)) {
      i++;
      continue;
    }

    const rest = line.slice(eqIdx + 1);
    const inlineCommentMatch = rest.match(/^(\s*)(#.*)$/);
    let comment = lastComment;
    let afterEq = rest;
    if (inlineCommentMatch && !isQuotedStart(rest.trimStart())) {
      afterEq = '';
      if (inlineCommentMatch[2]) {
        comment = comment ? `${comment}; ${inlineCommentMatch[2].slice(1).trim()}` : inlineCommentMatch[2].slice(1).trim();
      }
    }

    let value: string;
    let trailingComment: string | undefined;
    const leading = afterEq.trimStart();
    if (leading.startsWith('"')) {
      const result = parseQuoted(afterEq, '"', key, i, lines, (l) => parseDoubleQuotedLine(l));
      value = result.value;
      trailingComment = result.trailingComment;
      i = result.nextIndex;
    } else if (leading.startsWith("'")) {
      const result = parseQuoted(afterEq, "'", key, i, lines, (l) => parseSingleQuotedLine(l));
      value = result.value;
      trailingComment = result.trailingComment;
      i = result.nextIndex;
    } else {
      const unquoted = afterEq.trim();
      const hashIdx = unquoted.indexOf(' #');
      if (hashIdx !== -1) {
        value = unquoted.slice(0, hashIdx);
        const c = unquoted.slice(hashIdx + 2).trim();
        if (c) trailingComment = c;
      } else {
        value = unquoted;
      }
      i++;
    }

    const entry: EnvEntry = { key, value };
    const finalComment = trailingComment ?? comment ?? flushComment();
    if (finalComment) entry.comment = finalComment;
    entries.push(entry);
  }

  return entries;
}

interface QuoteLineResult {
  value: string;
  closed: boolean;
  remaining: string;
}

function parseDoubleQuotedLine(line: string): QuoteLineResult {
  let value = '';
  let j = 0;
  let inEscape = false;
  while (j < line.length) {
    const ch = line[j];
    if (inEscape) {
      if (ch === 'n') value += '\n';
      else if (ch === 'r') value += '\r';
      else if (ch === 't') value += '\t';
      else if (ch === '\\') value += '\\';
      else if (ch === '"') value += '"';
      else value += ch ?? '';
      inEscape = false;
    } else if (ch === '\\') {
      inEscape = true;
    } else if (ch === '"') {
      return { value, closed: true, remaining: line.slice(j + 1) };
    } else {
      value += ch ?? '';
    }
    j++;
  }
  return { value, closed: false, remaining: '' };
}

function parseSingleQuotedLine(line: string): QuoteLineResult {
  let value = '';
  let j = 0;
  while (j < line.length) {
    const ch = line[j];
    if (ch === "'") {
      return { value, closed: true, remaining: line.slice(j + 1) };
    }
    value += ch ?? '';
    j++;
  }
  return { value, closed: false, remaining: '' };
}

interface ParseResult {
  value: string;
  trailingComment?: string;
  nextIndex: number;
}

function parseQuoted(
  firstLine: string,
  _quote: '"' | "'",
  key: string,
  startIndex: number,
  lines: string[],
  parseLine: (l: string) => QuoteLineResult,
): ParseResult {
  const quoteChar = _quote;
  const trimmed = firstLine.trimStart();
  if (!trimmed.startsWith(quoteChar)) {
    throw new Error(`Internal: expected ${quoteChar} for key ${key}`);
  }
  const afterQuote = trimmed.slice(1);

  let buf = '';
  let j = startIndex;
  const first = parseLine(afterQuote);
  buf = first.value;
  if (first.closed) {
    const rest = first.remaining.trim();
    const c = extractTrailingComment(rest);
    return { value: buf, trailingComment: c, nextIndex: startIndex + 1 };
  }
  j = startIndex + 1;
  while (j < lines.length) {
    const line = lines[j] ?? '';
    const res = parseLine(line);
    buf += '\n' + res.value;
    if (res.closed) {
      const rest = res.remaining.trim();
      const c = extractTrailingComment(rest);
      return { value: buf, trailingComment: c, nextIndex: j + 1 };
    }
    j++;
  }
  throw new Error(`Unterminated quoted value for key ${key}`);
}

function extractTrailingComment(rest: string): string | undefined {
  if (rest.startsWith('#')) {
    return rest.slice(1).trim() || undefined;
  }
  return undefined;
}

function isQuotedStart(s: string): boolean {
  return s.startsWith('"') || s.startsWith("'");
}

export function serializeEnv(entries: EnvEntry[]): string {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.comment) {
      out.push(`# ${entry.comment}`);
    }
    if (needsQuoting(entry.value)) {
      out.push(`${entry.key}="${escapeDoubleQuoted(entry.value)}"`);
    } else {
      out.push(`${entry.key}=${entry.value}`);
    }
  }
  return out.join('\n') + (out.length > 0 ? '\n' : '');
}

function needsQuoting(value: string): boolean {
  if (value === '') return false;
  if (/[\s#"'\\$`]/.test(value)) return true;
  return false;
}

function escapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function readEnvFile(filePath: string): EnvEntry[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseEnv(content);
}

export function writeEnvFile(filePath: string, entries: EnvEntry[]): void {
  fs.writeFileSync(filePath, serializeEnv(entries), { encoding: 'utf8', mode: 0o600 });
}

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}
