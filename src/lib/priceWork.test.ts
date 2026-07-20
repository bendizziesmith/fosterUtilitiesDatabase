import { describe, it, expect } from 'vitest';
import {
  parseTrench,
  parseJoint,
  sumSection,
  numberToInput,
  fieldsToLocal,
  buildPriceWorkUpdate,
  trenchTotal,
  jointTotal,
  hasPriceWork,
  formatMetres,
  formatPriceWorkSummary,
  liveTrenchTotal,
  liveJointTotal,
  localHasPriceWork,
  EMPTY_PRICE_WORK_LOCAL,
  type PriceWorkFields,
  type PriceWorkLocal,
} from './priceWork';

describe('parseTrench (metres, decimals allowed)', () => {
  it('parses a whole number', () => {
    expect(parseTrench('57')).toBe(57);
  });
  it('parses a decimal', () => {
    expect(parseTrench('57.5')).toBe(57.5);
  });
  it('treats empty string as null', () => {
    expect(parseTrench('')).toBeNull();
  });
  it('treats whitespace as null', () => {
    expect(parseTrench('   ')).toBeNull();
  });
  it('treats non-numeric as null', () => {
    expect(parseTrench('abc')).toBeNull();
  });
  it('treats negative as null', () => {
    expect(parseTrench('-3')).toBeNull();
  });
  it('keeps an explicit zero', () => {
    expect(parseTrench('0')).toBe(0);
  });
});

describe('parseJoint (count, whole numbers)', () => {
  it('parses a whole number', () => {
    expect(parseJoint('3')).toBe(3);
  });
  it('rounds a decimal to the nearest integer', () => {
    expect(parseJoint('3.4')).toBe(3);
    expect(parseJoint('3.6')).toBe(4);
  });
  it('treats empty string as null', () => {
    expect(parseJoint('')).toBeNull();
  });
  it('treats negative as null', () => {
    expect(parseJoint('-2')).toBeNull();
  });
  it('keeps an explicit zero', () => {
    expect(parseJoint('0')).toBe(0);
  });
});

describe('sumSection', () => {
  it('sums three numbers', () => {
    expect(sumSection([10, 20, 27])).toBe(57);
  });
  it('treats null as zero', () => {
    expect(sumSection([10, null, 5])).toBe(15);
  });
  it('sums decimals without float drift', () => {
    expect(sumSection([0.1, 0.2, null])).toBe(0.3);
  });
  it('is zero for all null', () => {
    expect(sumSection([null, null, null])).toBe(0);
  });
});

describe('numberToInput', () => {
  it('renders a number as a string', () => {
    expect(numberToInput(57)).toBe('57');
  });
  it('renders null as empty string', () => {
    expect(numberToInput(null)).toBe('');
  });
  it('renders undefined as empty string', () => {
    expect(numberToInput(undefined)).toBe('');
  });
});

describe('fieldsToLocal', () => {
  it('maps stored fields to input strings, null -> empty', () => {
    const fields: PriceWorkFields = {
      pw_trench_verge: 10,
      pw_trench_footway: null,
      pw_trench_carriageway: 47,
      pw_joint_verge: 3,
      pw_joint_footway: null,
      pw_joint_carriageway: null,
    };
    expect(fieldsToLocal(fields)).toEqual({
      pw_trench_verge: '10',
      pw_trench_footway: '',
      pw_trench_carriageway: '47',
      pw_joint_verge: '3',
      pw_joint_footway: '',
      pw_joint_carriageway: '',
    });
  });
});

describe('buildPriceWorkUpdate (local strings -> save payload)', () => {
  it('maps filled and blank fields, blanks -> null', () => {
    const local: PriceWorkLocal = {
      pw_trench_verge: '10',
      pw_trench_footway: '20.5',
      pw_trench_carriageway: '',
      pw_joint_verge: '3',
      pw_joint_footway: '',
      pw_joint_carriageway: '2',
    };
    expect(buildPriceWorkUpdate(local)).toEqual({
      pw_trench_verge: 10,
      pw_trench_footway: 20.5,
      pw_trench_carriageway: null,
      pw_joint_verge: 3,
      pw_joint_footway: null,
      pw_joint_carriageway: 2,
    });
  });
  it('maps a fully-empty local to all nulls', () => {
    expect(buildPriceWorkUpdate(EMPTY_PRICE_WORK_LOCAL)).toEqual({
      pw_trench_verge: null,
      pw_trench_footway: null,
      pw_trench_carriageway: null,
      pw_joint_verge: null,
      pw_joint_footway: null,
      pw_joint_carriageway: null,
    });
  });
});

describe('section totals from stored fields', () => {
  const fields: PriceWorkFields = {
    pw_trench_verge: 10,
    pw_trench_footway: 20,
    pw_trench_carriageway: 27,
    pw_joint_verge: 1,
    pw_joint_footway: 2,
    pw_joint_carriageway: null,
  };
  it('sums trench', () => {
    expect(trenchTotal(fields)).toBe(57);
  });
  it('sums joint', () => {
    expect(jointTotal(fields)).toBe(3);
  });
});

describe('hasPriceWork', () => {
  const empty: PriceWorkFields = {
    pw_trench_verge: null,
    pw_trench_footway: null,
    pw_trench_carriageway: null,
    pw_joint_verge: null,
    pw_joint_footway: null,
    pw_joint_carriageway: null,
  };
  it('is false when all null', () => {
    expect(hasPriceWork(empty)).toBe(false);
  });
  it('is true when any value present', () => {
    expect(hasPriceWork({ ...empty, pw_joint_verge: 1 })).toBe(true);
  });
  it('is true for an explicit zero', () => {
    expect(hasPriceWork({ ...empty, pw_trench_verge: 0 })).toBe(true);
  });
});

describe('formatMetres', () => {
  it('renders a whole number without decimals', () => {
    expect(formatMetres(57)).toBe('57');
  });
  it('strips trailing zeros', () => {
    expect(formatMetres(57.5)).toBe('57.5');
    expect(formatMetres(57.0)).toBe('57');
  });
});

describe('formatPriceWorkSummary (chip text)', () => {
  const empty: PriceWorkFields = {
    pw_trench_verge: null,
    pw_trench_footway: null,
    pw_trench_carriageway: null,
    pw_joint_verge: null,
    pw_joint_footway: null,
    pw_joint_carriageway: null,
  };
  it('returns null when there is no price work', () => {
    expect(formatPriceWorkSummary(empty)).toBeNull();
  });
  it('summarises both sections', () => {
    const fields: PriceWorkFields = {
      pw_trench_verge: 30,
      pw_trench_footway: 27,
      pw_trench_carriageway: null,
      pw_joint_verge: 3,
      pw_joint_footway: null,
      pw_joint_carriageway: null,
    };
    expect(formatPriceWorkSummary(fields)).toBe('Price work · Trench 57 m · Joint Hole 3');
  });
  it('shows only trench when joint total is zero', () => {
    expect(formatPriceWorkSummary({ ...empty, pw_trench_verge: 12 })).toBe(
      'Price work · Trench 12 m'
    );
  });
  it('shows only joint when trench total is zero', () => {
    expect(formatPriceWorkSummary({ ...empty, pw_joint_carriageway: 5 })).toBe(
      'Price work · Joint Hole 5'
    );
  });
  it('falls back to bare label when a value is present but totals are zero', () => {
    expect(formatPriceWorkSummary({ ...empty, pw_trench_verge: 0 })).toBe('Price work');
  });
});

describe('live totals from input strings', () => {
  const local: PriceWorkLocal = {
    pw_trench_verge: '10',
    pw_trench_footway: '20.5',
    pw_trench_carriageway: '',
    pw_joint_verge: '3',
    pw_joint_footway: '2',
    pw_joint_carriageway: '',
  };
  it('computes live trench total', () => {
    expect(liveTrenchTotal(local)).toBe(30.5);
  });
  it('computes live joint total', () => {
    expect(liveJointTotal(local)).toBe(5);
  });
  it('reports whether local has any price work', () => {
    expect(localHasPriceWork(local)).toBe(true);
    expect(localHasPriceWork(EMPTY_PRICE_WORK_LOCAL)).toBe(false);
  });
});
