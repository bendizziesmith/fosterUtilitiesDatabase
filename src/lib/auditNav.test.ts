import { describe, it, expect } from 'vitest';
import { currentArea } from './auditNav';

describe('currentArea — which bottom-bar button is highlighted', () => {
  it('Site Audits for every audit page', () => {
    ['/audits', '/audits/new', '/audits/records', '/audits/detail'].forEach((p) => expect(currentArea(p)).toBe('audits'));
  });
  it('Kit & Plant for kit, lockup and person / van pages', () => {
    ['/kit', '/kit/van'].forEach((p) => expect(currentArea(p)).toBe('kit'));
  });
  it('Home for the dashboard', () => {
    expect(currentArea('/')).toBe('home');
  });
});
