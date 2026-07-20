import { describe, it, expect } from 'vitest';
import {
  getHavsCellState,
  getHavsCellPresentation,
  HAVS_CELL_PRESENTATION,
} from './havsGridStatus';

const NOW = new Date('2026-07-20T12:00:00Z');

describe('getHavsCellState', () => {
  it('maps a submitted record to submitted', () => {
    expect(getHavsCellState('submitted', '2026-07-19', NOW)).toBe('submitted');
  });
  it('maps any non-submitted status to draft', () => {
    expect(getHavsCellState('draft', '2026-07-19', NOW)).toBe('draft');
    expect(getHavsCellState('in_progress', '2026-07-19', NOW)).toBe('draft');
  });
  it('maps no record in a past week to missing', () => {
    expect(getHavsCellState(null, '2026-07-05', NOW)).toBe('missing');
    expect(getHavsCellState(undefined, '2026-07-12', NOW)).toBe('missing');
  });
  it('maps no record in a future (or current) week to future', () => {
    expect(getHavsCellState(null, '2026-07-26', NOW)).toBe('future');
  });
  it('keeps a submitted record submitted even for a future week', () => {
    expect(getHavsCellState('submitted', '2026-07-26', NOW)).toBe('submitted');
  });
});

describe('HAVS_CELL_PRESENTATION', () => {
  it('submitted is clickable and emerald', () => {
    const p = HAVS_CELL_PRESENTATION.submitted;
    expect(p.label).toBe('Submitted');
    expect(p.clickable).toBe(true);
    expect(p.chipClass).toContain('emerald');
  });
  it('draft is clickable, amber, and labelled Draft (not In Progress)', () => {
    const p = HAVS_CELL_PRESENTATION.draft;
    expect(p.label).toBe('Draft');
    expect(p.clickable).toBe(true);
    expect(p.chipClass).toContain('amber');
  });
  it('missing is non-clickable and red', () => {
    const p = HAVS_CELL_PRESENTATION.missing;
    expect(p.label).toBe('Missing');
    expect(p.clickable).toBe(false);
    expect(p.chipClass).toContain('red');
  });
  it('future is non-clickable and slate', () => {
    const p = HAVS_CELL_PRESENTATION.future;
    expect(p.label).toBe('Future');
    expect(p.clickable).toBe(false);
    expect(p.chipClass).toContain('slate');
  });
});

describe('getHavsCellPresentation', () => {
  it('combines state with its presentation', () => {
    const p = getHavsCellPresentation(null, '2026-07-05', NOW);
    expect(p.state).toBe('missing');
    expect(p.label).toBe('Missing');
    expect(p.clickable).toBe(false);
  });
  it('a submitted record is clickable', () => {
    const p = getHavsCellPresentation('submitted', '2026-07-19', NOW);
    expect(p.state).toBe('submitted');
    expect(p.clickable).toBe(true);
  });
});
