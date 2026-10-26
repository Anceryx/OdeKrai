import { describe, expect, it } from 'vitest';
import { displayPath } from './display-path';

describe('displayPath', () => {
  it('remove o prefixo de caminho estendido apenas para exibição e encurta pelo meio', () => {
    expect(displayPath('\\\\?\\C:\\pasta\\arquivo')).toBe('C:\\pasta\\arquivo');
    const path = `\\\\?\\C:\\Users\\${'nome\\'.repeat(20)}arquivo`;
    expect(displayPath(path, 20)).toHaveLength(20);
    expect(displayPath(path, 20)).toContain('…');
  });
});
