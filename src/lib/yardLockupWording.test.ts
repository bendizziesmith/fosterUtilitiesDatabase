import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * "Spare in yard" was renamed "Yard Lockup" everywhere a person sees it.
 * The status value 'spare' stays (no data change); "spare van" is a different thing.
 * This scans every string and JSX text in the audit / kit screens.
 */
const ROOT = join(__dirname, '..');
const files = [
  ...readdirSync(join(ROOT, 'apps/admin/components/audits')).map((f) => join(ROOT, 'apps/admin/components/audits', f)),
  join(ROOT, 'apps/admin/components/AdminDashboard.tsx'),
  join(ROOT, 'lib/siteAuditLogic.ts'),
  join(ROOT, 'lib/vanChange.ts'),
  join(ROOT, 'lib/lockupLogic.ts'),
].filter((f) => /\.(tsx?|ts)$/.test(f) && !f.endsWith('.test.ts'));

function visibleText(raw: string): string[] {
  // comments are never shown
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const out: string[] = [];
  for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  // JSX text between tags (not code)
  for (const m of src.matchAll(/>([^<>{}'"();=]+)</g)) out.push(m[1]);
  return out;
}

describe('wording: nobody sees "Spare in yard" any more', () => {
  it('no screen text says spare / spares for the yard', () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const t of visibleText(readFileSync(f, 'utf8'))) {
        const s = t.toLowerCase().replace(/spare[ -]van(s)?/g, '').replace(/spare_vehicle/g, '').replace(/(the )?yard lockup/g, '').replace(/take a spare/g, ''); // round 10: Justin's own button name
        if (s.trim() === 'spare' || s.trim() === 'moved_to_spare') continue; // status values, never shown
        if (/\bspares?\b|\bin (the )?yard\b|\bto (the )?yard\b|· yard/.test(s)) hits.push(`${f.split('/src/')[1]}: "${t.trim()}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the yard status reads "Yard Lockup"', async () => {
    const { holderLabel, previewSwap } = await import('./siteAuditLogic');
    expect(holderLabel({ status: 'spare', holder_kind: 'none', holder_employee_id: null, holder_name: null, holder_reg: null, vehicle_id: null })).toBe('Yard Lockup');
    expect(previewSwap({ plant_no: 'P1', type_name: 'Digger', vehicle_reg: 'Dom Oliver · YE24 TNL' }, { destination: 'spare' }, { mode: 'none' }).outgoing).toBe('P1 → Yard Lockup');
  });
});
