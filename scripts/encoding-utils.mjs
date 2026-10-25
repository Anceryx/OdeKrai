const suspiciousMojibake = new RegExp(
  '(?:\\u00c3[\\u0080-\\u009f\\u00a0-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u20ac\\u201a-\\u203a]|\\u00c2[\\u0080-\\u009f\\u00a0-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u20ac\\u201a-\\u203a]|\\u00e2\\u20ac[\\u0080-\\u009f\\u00a0-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u20ac\\u201a-\\u203a]|\\u00f0\\u0178|\\u00ef\\u00bb\\u00bf)',
  'u',
);
const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const cp1252Bytes = new Map();
const cp1252Upper = [
  '€',
  '\u0081',
  '‚',
  'ƒ',
  '„',
  '…',
  '†',
  '‡',
  'ˆ',
  '‰',
  'Š',
  '‹',
  'Œ',
  '\u008d',
  'Ž',
  '\u008f',
  '\u0090',
  '‘',
  '’',
  '“',
  '”',
  '•',
  '–',
  '—',
  '˜',
  '™',
  'š',
  '›',
  'œ',
  '\u009d',
  'ž',
  'Ÿ',
];

for (let byte = 0; byte <= 0xff; byte += 1) {
  cp1252Bytes.set(String.fromCharCode(byte), byte);
}
for (let offset = 0; offset < cp1252Upper.length; offset += 1) {
  cp1252Bytes.set(cp1252Upper[offset], 0x80 + offset);
}

export function isValidUtf8(bytes) {
  try {
    strictUtf8Decoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function inspectEncoding(bytes) {
  const validUtf8 = isValidUtf8(bytes);
  if (!validUtf8) return { validUtf8, hasBom: false, mojibake: false, text: null };
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  return { validUtf8, hasBom, mojibake: hasMojibake(text), text };
}

export function hasMojibake(value) {
  return value.split(/\s+/u).some((token) => suspiciousMojibake.test(token));
}

function decodeSuspiciousToken(token) {
  const bytes = [];
  for (const character of token) {
    const byte = cp1252Bytes.get(character);
    if (byte === undefined) return token;
    bytes.push(byte);
  }

  try {
    return strictUtf8Decoder.decode(Uint8Array.from(bytes));
  } catch {
    return token;
  }
}

export function repairMojibake(value) {
  return value.replace(/\S+/gu, (token) => {
    if (!suspiciousMojibake.test(token)) return token;
    let repaired = token;
    for (let attempt = 0; attempt < 3 && suspiciousMojibake.test(repaired); attempt += 1) {
      const next = decodeSuspiciousToken(repaired);
      if (next === repaired) break;
      repaired = next;
    }
    return repaired;
  });
}
