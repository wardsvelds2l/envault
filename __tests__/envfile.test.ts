import { describe, it, expect } from 'vitest';
import { parseEnv, serializeEnv, isValidKey, readEnvFile, writeEnvFile } from '../src/envfile.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('envfile', () => {
  describe('parseEnv', () => {
    it('parses basic KEY=value', () => {
      const r = parseEnv('FOO=bar');
      expect(r).toHaveLength(1);
      expect(r[0]).toEqual({ key: 'FOO', value: 'bar' });
    });

    it('parses multiple entries', () => {
      const r = parseEnv('FOO=bar\nBAZ=qux\n');
      expect(r).toHaveLength(2);
      expect(r[0]?.key).toBe('FOO');
      expect(r[1]?.key).toBe('BAZ');
    });

    it('skips blank lines and comments', () => {
      const r = parseEnv('\n# this is a comment\nFOO=bar\n\n# another\nBAZ=qux\n');
      expect(r).toHaveLength(2);
      expect(r[0]?.key).toBe('FOO');
      expect(r[1]?.key).toBe('BAZ');
    });

    it('strips export prefix', () => {
      const r = parseEnv('export FOO=bar');
      expect(r[0]?.key).toBe('FOO');
      expect(r[0]?.value).toBe('bar');
    });

    it('handles double-quoted values', () => {
      const r = parseEnv('FOO="hello world"');
      expect(r[0]?.value).toBe('hello world');
    });

    it('handles single-quoted values', () => {
      const r = parseEnv("FOO='hello world'");
      expect(r[0]?.value).toBe('hello world');
    });

    it('processes escape sequences in double-quoted values', () => {
      const r = parseEnv('FOO="line1\\nline2\\t\\"q\\""');
      expect(r[0]?.value).toBe('line1\nline2\t"q"');
    });

    it('does not process escape sequences in single-quoted values', () => {
      const r = parseEnv("FOO='line1\\nline2'");
      expect(r[0]?.value).toBe('line1\\nline2');
    });

    it('handles multiline double-quoted values', () => {
      const r = parseEnv('FOO="line1\nline2\nline3"');
      expect(r[0]?.value).toBe('line1\nline2\nline3');
    });

    it('handles multiline single-quoted values', () => {
      const r = parseEnv("FOO='line1\nline2'");
      expect(r[0]?.value).toBe('line1\nline2');
    });

    it('handles empty values', () => {
      const r = parseEnv('FOO=');
      expect(r[0]?.value).toBe('');
    });

    it('handles empty quoted values', () => {
      const r = parseEnv('FOO=""');
      expect(r[0]?.value).toBe('');
    });

    it('captures leading comment as the variable comment', () => {
      const r = parseEnv('# this is a comment\nFOO=bar');
      expect(r[0]?.comment).toBe('this is a comment');
    });

    it('strips inline unquoted comment after space', () => {
      const r = parseEnv('FOO=bar # inline comment');
      expect(r[0]?.value).toBe('bar');
    });

    it('does not strip # in middle of unquoted value', () => {
      const r = parseEnv('FOO=bar#baz');
      expect(r[0]?.value).toBe('bar#baz');
    });

    it('handles keys with underscores and digits', () => {
      const r = parseEnv('FOO_BAR_2=hello');
      expect(r[0]?.key).toBe('FOO_BAR_2');
    });

    it('rejects invalid keys', () => {
      const r = parseEnv('1FOO=bar\nFOO BAR=baz');
      expect(r).toHaveLength(0);
    });

    it('preserves value with = sign', () => {
      const r = parseEnv('FOO=a=b=c');
      expect(r[0]?.value).toBe('a=b=c');
    });

    it('handles CRLF line endings', () => {
      const r = parseEnv('FOO=bar\r\nBAZ=qux\r\n');
      expect(r).toHaveLength(2);
    });

    it('captures comment and then handles next entry', () => {
      const r = parseEnv('# comment 1\nFOO=bar\n# comment 2\nBAZ=qux');
      expect(r[0]?.comment).toBe('comment 1');
      expect(r[1]?.comment).toBe('comment 2');
    });
  });

  describe('serializeEnv', () => {
    it('serializes basic entries', () => {
      const s = serializeEnv([{ key: 'FOO', value: 'bar' }]);
      expect(s).toContain('FOO=bar');
    });

    it('quotes values containing spaces', () => {
      const s = serializeEnv([{ key: 'FOO', value: 'hello world' }]);
      expect(s).toContain('FOO="hello world"');
    });

    it('escapes special characters in quoted values', () => {
      const s = serializeEnv([{ key: 'FOO', value: 'a"b\\c\nd' }]);
      expect(s).toContain('FOO="a\\"b\\\\c\\nd"');
    });

    it('includes comments', () => {
      const s = serializeEnv([{ key: 'FOO', value: 'bar', comment: 'hello' }]);
      expect(s).toContain('# hello');
    });

    it('does not quote simple values', () => {
      const s = serializeEnv([{ key: 'FOO', value: 'simple-value_123' }]);
      expect(s).toContain('FOO=simple-value_123');
    });

    it('roundtrips through parse/serialize', () => {
      const original = [
        { key: 'PLAIN', value: 'hello' },
        { key: 'SPACED', value: 'hello world' },
        { key: 'QUOTES', value: 'has "quotes"' },
        { key: 'NEWLINE', value: 'a\nb' },
      ];
      const serialized = serializeEnv(original);
      const parsed = parseEnv(serialized);
      expect(parsed).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(parsed[i]?.key).toBe(original[i]?.key);
        expect(parsed[i]?.value).toBe(original[i]?.value);
      }
    });
  });

  describe('isValidKey', () => {
    it('accepts valid env var names', () => {
      expect(isValidKey('FOO')).toBe(true);
      expect(isValidKey('_FOO')).toBe(true);
      expect(isValidKey('FOO_BAR')).toBe(true);
      expect(isValidKey('FOO123')).toBe(true);
    });

    it('rejects invalid env var names', () => {
      expect(isValidKey('1FOO')).toBe(false);
      expect(isValidKey('FOO BAR')).toBe(false);
      expect(isValidKey('FOO-BAR')).toBe(false);
      expect(isValidKey('')).toBe(false);
      expect(isValidKey('FOO.BAR')).toBe(false);
    });
  });

  describe('readEnvFile / writeEnvFile', () => {
    it('round-trips through filesystem', () => {
      const tmpFile = path.join(os.tmpdir(), `envault-envfile-${Date.now()}.env`);
      try {
        const entries = [
          { key: 'FOO', value: 'bar' },
          { key: 'BAZ', value: 'qux with space' },
        ];
        writeEnvFile(tmpFile, entries);
        const back = readEnvFile(tmpFile);
        expect(back).toEqual(entries);
      } finally {
        fs.rmSync(tmpFile, { force: true });
      }
    });
  });
});
