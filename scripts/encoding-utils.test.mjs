import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hasMojibake, inspectEncoding, repairMojibake } from './encoding-utils.mjs';

const fixture = (name) =>
  fileURLToPath(new URL(`../tests/encoding-fixtures/${name}`, import.meta.url));

describe('verificação de codificação', () => {
  it('identifica e repara exemplos corrompidos com round-trip Windows-1252 real', async () => {
    const corrupted = await readFile(fixture('mojibake.txt'), 'utf8');
    expect(hasMojibake(corrupted)).toBe(true);
    expect(repairMojibake(corrupted)).toBe(
      'Visão geral, Identidade e memória, Configurações\nESPAÇO INTELIGÊNCIA PERSONALIZAÇÃO\n',
    );
  });

  it('preserva o exemplo correto e reconhece BOM e UTF-8 inválido', async () => {
    const good = await readFile(fixture('correct.txt'), 'utf8');
    expect(hasMojibake(good)).toBe(false);
    expect(repairMojibake(good)).toBe(good);
    expect(inspectEncoding(Buffer.from(good, 'utf8'))).toMatchObject({
      validUtf8: true,
      hasBom: false,
      mojibake: false,
    });
    expect(inspectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x41]))).toMatchObject({ hasBom: true });
    expect(inspectEncoding(Buffer.from([0xc3, 0x28]))).toMatchObject({ validUtf8: false });
  });
});
