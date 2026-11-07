/**
 * Phone typing helpers for the audit pages (7 Nov 2026, after the first live audit on an iPhone).
 * Pure rules, tested in phoneInput.test.ts.
 */

const NOT_TYPING = new Set(['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color', 'image', 'hidden']);

/** Does focusing this element bring up the phone keyboard (or the date wheel)? */
export function isTypingField(el: { tagName: string; type?: string; readOnly?: boolean } | null | undefined): boolean {
  if (!el || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !NOT_TYPING.has((el.type || 'text').toLowerCase());
}

/** The visible screen shrinks this much (px) or more when the keyboard is up; toolbar changes are smaller. */
const KEYBOARD_MIN = 150;

export function keyboardLooksOpen(s: { typing: boolean; innerHeight: number; viewportHeight: number | null }): boolean {
  if (s.typing) return true;
  return s.viewportHeight !== null && s.innerHeight - s.viewportHeight >= KEYBOARD_MIN;
}

export type PlantMode = 'numbers' | 'letters';

/** Plant no boxes open the number pad; the small button switches to letters ("ABC") and back ("123"). */
export function plantKeyboard(mode: PlantMode): { inputMode: 'numeric' | 'text'; button: 'ABC' | '123'; buttonLabel: string } {
  return mode === 'numbers'
    ? { inputMode: 'numeric', button: 'ABC', buttonLabel: 'Switch to letters' }
    : { inputMode: 'text', button: '123', buttonLabel: 'Switch to numbers' };
}

export const nextPlantMode = (m: PlantMode): PlantMode => (m === 'numbers' ? 'letters' : 'numbers');
