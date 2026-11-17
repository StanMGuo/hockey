export type Nickname = { display: string; key: string };

const NAME = /^[\p{L}\p{N}]+(?:[ '\-][\p{L}\p{N}]+)*$/u;

export function normalizeNickname(raw: string): Nickname | null {
  const display = raw.trim().replace(/\s+/g, ' ');
  if (display.length < 1 || display.length > 20) return null;
  if (!NAME.test(display)) return null;
  return { display, key: display.toLocaleLowerCase() };
}

export function normalizeJersey(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

export function normalizePin(raw: string): string | null {
  return /^\d{4}$/.test(raw) ? raw : null;
}
