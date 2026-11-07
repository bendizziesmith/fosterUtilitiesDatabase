import { describe, it, expect } from 'vitest';
import { isTypingField, keyboardLooksOpen, plantKeyboard, nextPlantMode } from './phoneInput';

describe('isTypingField: fields that bring up the phone keyboard', () => {
  it('text, number and date boxes and text areas do', () => {
    expect(isTypingField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingField({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTypingField({ tagName: 'INPUT', type: 'date' })).toBe(true);
    expect(isTypingField({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTypingField({ tagName: 'TEXTAREA' })).toBe(true);
  });
  it('buttons, ticks, radios, file pickers and read-only boxes do not', () => {
    expect(isTypingField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingField({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    expect(isTypingField({ tagName: 'INPUT', type: 'file' })).toBe(false);
    expect(isTypingField({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false);
    expect(isTypingField(null)).toBe(false);
  });
});

describe('keyboardLooksOpen: hide the footer and bottom bar while typing', () => {
  it('open when a typing field has focus', () => {
    expect(keyboardLooksOpen({ typing: true, innerHeight: 844, viewportHeight: 844 })).toBe(true);
  });
  it('open when the visible screen has shrunk a lot (the keyboard is up)', () => {
    expect(keyboardLooksOpen({ typing: false, innerHeight: 844, viewportHeight: 500 })).toBe(true);
  });
  it('closed when nothing has focus and the screen is full height (small toolbar changes ignored)', () => {
    expect(keyboardLooksOpen({ typing: false, innerHeight: 844, viewportHeight: 844 })).toBe(false);
    expect(keyboardLooksOpen({ typing: false, innerHeight: 844, viewportHeight: 790 })).toBe(false);
    expect(keyboardLooksOpen({ typing: false, innerHeight: 844, viewportHeight: null })).toBe(false);
  });
});

describe('plantKeyboard: number pad first, "ABC" switches to letters', () => {
  it('starts on the number pad, the button says ABC', () => {
    expect(plantKeyboard('numbers')).toEqual({ inputMode: 'numeric', button: 'ABC', buttonLabel: 'Switch to letters' });
  });
  it('on letters the button says 123', () => {
    expect(plantKeyboard('letters')).toEqual({ inputMode: 'text', button: '123', buttonLabel: 'Switch to numbers' });
  });
  it('the button swaps the mode', () => {
    expect(nextPlantMode('numbers')).toBe('letters');
    expect(nextPlantMode('letters')).toBe('numbers');
  });
});
