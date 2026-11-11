/** Temporary hardcoded gate password. Replace with real auth later (OQ-3). */
export const APP_PASSWORD = 'hawksu9red';

export const GATE_SESSION_KEY = 'hdt-gate-ok';

export function checkPassword(input: string): boolean {
  return input === APP_PASSWORD;
}

export function isGateUnlocked(): boolean {
  try {
    return sessionStorage.getItem(GATE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockGate(): void {
  try {
    sessionStorage.setItem(GATE_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}
