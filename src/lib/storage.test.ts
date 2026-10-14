import { describe, it, expect } from 'vitest';
import {
  validateFile,
  sanitizeFileName,
  buildStoragePath,
  EXCUSE_MIME,
  EXCUSE_MAX,
} from './storage';

describe('validateFile', () => {
  it('rejects a disallowed type', () => {
    const result = validateFile(
      { type: 'application/zip', size: 10, name: 'a.zip' },
      EXCUSE_MIME,
      EXCUSE_MAX,
    );
    expect(result).toEqual({ ok: false, reason: 'type' });
  });

  it('rejects a file one byte over the limit', () => {
    const result = validateFile(
      { type: 'application/pdf', size: EXCUSE_MAX + 1, name: 'a.pdf' },
      EXCUSE_MIME,
      EXCUSE_MAX,
    );
    expect(result).toEqual({ ok: false, reason: 'size' });
  });

  it('accepts a file exactly at the limit', () => {
    const result = validateFile(
      { type: 'application/pdf', size: EXCUSE_MAX, name: 'a.pdf' },
      EXCUSE_MIME,
      EXCUSE_MAX,
    );
    expect(result).toEqual({ ok: true });
  });

  it('accepts an allowed type under the limit', () => {
    const result = validateFile(
      { type: 'image/png', size: 1024, name: 'a.png' },
      EXCUSE_MIME,
      EXCUSE_MAX,
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('sanitizeFileName', () => {
  it('strips path separators', () => {
    expect(sanitizeFileName('a/b\\c.pdf')).toBe('abc.pdf');
  });

  it('strips parent-directory references', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('etcpasswd');
  });

  it('collapses whitespace and keeps the extension', () => {
    expect(sanitizeFileName('  my    file.pdf ')).toBe('my file.pdf');
  });
});

describe('buildStoragePath', () => {
  it('produces the ${userId}/${segment}/${safeName} shape', () => {
    expect(buildStoragePath('user-1', 'req-9', 'cert.pdf')).toBe(
      'user-1/req-9/cert.pdf',
    );
  });

  it('sanitizes the file name segment', () => {
    expect(buildStoragePath('user-1', 'req-9', '../evil.pdf')).toBe(
      'user-1/req-9/evil.pdf',
    );
  });
});
