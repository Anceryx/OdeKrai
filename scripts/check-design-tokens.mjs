import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const tokensPath = fileURLToPath(new URL('src/ui/design-tokens.css', root));
const stylesPath = fileURLToPath(new URL('src/ui/styles.css', root));
const tokensCss = readFileSync(tokensPath, 'utf8');
const stylesCss = readFileSync(stylesPath, 'utf8');
const tokens = Object.fromEntries(
  [...tokensCss.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
);

const required = [
  'color-background',
  'color-surface',
  'color-surface-raised',
  'color-border-subtle',
  'color-border-strong',
  'color-text',
  'color-text-secondary',
  'color-accent',
  'color-accent-contrast',
  'color-accent-action-end',
  'color-success',
  'color-success-surface',
  'color-warning',
  'color-warning-surface',
  'color-danger',
  'color-danger-surface',
  'color-info',
  'color-info-surface',
  'color-risk-reading',
  'color-risk-reading-surface',
  'color-risk-write',
  'color-risk-write-surface',
  'color-risk-communication',
  'color-risk-communication-surface',
  'color-risk-destructive',
  'color-risk-destructive-surface',
  'color-risk-code',
  'color-risk-code-surface',
  'space-1',
  'space-10',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'elevation-1',
  'elevation-2',
  'motion-fast',
  'motion-normal',
  'motion-slow',
];
for (const name of required) assert.ok(tokens[name], `Token ausente: --${name}`);

function rgb(token) {
  assert.match(token, /^#[\da-f]{6}$/i, `Esperada cor hexadecimal opaca, recebido: ${token}`);
  return token
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255);
}

function luminance(color) {
  const [red, green, blue] = rgb(color).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hue(color) {
  const channels = rgb(color).map((channel) => channel * 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  if (maximum === minimum) return 0;
  const delta = maximum - minimum;
  const sector =
    maximum === channels[0]
      ? ((channels[1] - channels[2]) / delta) % 6
      : maximum === channels[1]
        ? (channels[2] - channels[0]) / delta + 2
        : (channels[0] - channels[1]) / delta + 4;
  return (((sector * 60) % 360) + 360) % 360;
}

function assertContrast(label, foreground, background, minimum) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= minimum, `${label}: contraste ${ratio.toFixed(2)}:1; mínimo ${minimum}:1`);
  console.log(`${label}: ${ratio.toFixed(2)}:1 (mínimo ${minimum}:1)`);
}

assert.ok(!Object.hasOwn(tokens, 'color-border'), 'Remova o token antigo --color-border');
assertContrast('Borda forte/superfície', tokens['color-border-strong'], tokens['color-surface'], 3);
assertContrast(
  'Borda forte/superfície elevada',
  tokens['color-border-strong'],
  tokens['color-surface-raised'],
  3,
);
assertContrast('Texto/acento', tokens['color-accent-contrast'], tokens['color-accent'], 4.5);
const warningAccentDistance = Math.abs(hue(tokens['color-warning']) - hue(tokens['color-accent']));
assert.ok(
  warningAccentDistance >= 20,
  `Warning deve ser amarelo distinto do laranja (diferença de matiz ${warningAccentDistance.toFixed(1)}°)`,
);
assertContrast(
  'Texto/acento no fim do gradiente de ação',
  tokens['color-accent-contrast'],
  tokens['color-accent-action-end'],
  4.5,
);
assertContrast('Texto principal/fundo', tokens['color-text'], tokens['color-background'], 4.5);
assertContrast(
  'Texto secundário/fundo',
  tokens['color-text-secondary'],
  tokens['color-background'],
  4.5,
);

for (const state of ['success', 'warning', 'danger', 'info']) {
  assertContrast(
    `Estado ${state}`,
    tokens[`color-${state}`],
    tokens[`color-${state}-surface`],
    4.5,
  );
}
for (const risk of ['reading', 'write', 'communication', 'destructive', 'code']) {
  assertContrast(
    `Risco ${risk}`,
    tokens[`color-risk-${risk}`],
    tokens[`color-risk-${risk}-surface`],
    4.5,
  );
}

const spaces = [...tokensCss.matchAll(/--space-\d+:\s*(\d+)px;/g)];
assert.ok(spaces.length >= 8, 'A escala deve definir pelo menos oito tokens de espaçamento');
for (const [, value] of spaces)
  assert.equal(Number(value) % 4, 0, `Espaçamento fora da escala de 4 px: ${value}px`);
for (const [name, expected] of [
  ['motion-fast', '120ms'],
  ['motion-normal', '200ms'],
  ['motion-slow', '320ms'],
]) {
  assert.equal(tokens[name], expected, `--${name} deve ser ${expected}`);
}
for (const elevation of ['elevation-1', 'elevation-2']) {
  assert.match(
    tokens[elevation],
    /^0\s+\d+px\s+0(?:\s|$)/,
    `--${elevation} deve usar elevação sem blur`,
  );
}
assert.match(
  stylesCss,
  /html\[data-performance=['"]on['"]\]/,
  'O modo data-performance="on" está ausente',
);
assert.match(
  stylesCss,
  /data-translucent/,
  'O modo de desempenho deve remover superfícies translúcidas',
);
assert.match(
  stylesCss,
  /data-animated-gradient/,
  'O modo de desempenho deve desativar gradientes animados',
);
for (const selector of ['.primary-button', '.send-button', '.ui-button--primary']) {
  const escaped = selector.replaceAll('.', '\\.');
  const block = stylesCss.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(block, `Regra ausente: ${selector}`);
  assert.match(
    block,
    /color:\s*var\(--color-accent-contrast\)/,
    `${selector} deve usar texto escuro sobre o laranja`,
  );
}

console.log(
  `Design system validado: ${required.length} tokens presentes; contrastes e escalas aprovados.`,
);
