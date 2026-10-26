export function displayPath(path: string, maxLength = 72): string {
  const clean = path.replace(/^\\\\\?\\/, '');
  if (clean.length <= maxLength) return clean;
  const left = Math.ceil((maxLength - 1) / 2);
  const right = Math.floor((maxLength - 1) / 2);
  return `${clean.slice(0, left)}…${clean.slice(-right)}`;
}
