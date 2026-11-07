import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * iPhone browsers zoom the whole page in when you tap a box whose text is under 16px (7 Nov 2026:
 * Change van's "Type a name or a reg…" zoomed in and pushed Next / Cancel off screen). Every input,
 * select and textarea on the Site Audits and Kit & Plant pages must be 16px on phones: the shared
 * inputCls / dateCls (text-base on phones), or a class with text-base and no smaller size for phones.
 * Zooming itself is NOT blocked (pinch-zoom still works).
 */
const DIR = join(__dirname, '..', 'apps/admin/components/audits');
const files = readdirSync(DIR).filter((f) => f.endsWith('.tsx')).map((f) => [f, readFileSync(join(DIR, f), 'utf8')] as const);

/** the opening tag of every <input / <select / <textarea (up to its first unquoted ">") */
function fields(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    let depth = 0;
    let i = m.index! + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && src[i - 1] !== '=') break;
    }
    out.push(src.slice(m.index!, i + 1));
  }
  return out;
}

const SKIP = /type="(checkbox|radio|file|hidden)"|className="sr-only"/;

describe('no zoom on iPhone: every box on the audit and kit pages is 16px on phones', () => {
  for (const [name, src] of files) {
    for (const tag of fields(src).filter((t) => !SKIP.test(t))) {
      it(`${name}: ${tag.replace(/\s+/g, ' ').slice(0, 70)}…`, () => {
        const shared = /\$\{(inputCls|dateCls)\}|\{(inputCls|dateCls)\}|className=\{`\$\{inputCls\}/.test(tag);
        // phone size = the first text-size class without a breakpoint prefix
        const phone = tag.match(/(?<![:\w-])text-(xs|sm|base|lg|xl)\b/)?.[1];
        expect(shared || phone === 'base' || phone === 'lg' || phone === 'xl', `${name} has a box under 16px on phones`).toBe(true);
      });
    }
  }
});
