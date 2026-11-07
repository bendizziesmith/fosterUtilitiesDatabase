import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TargetPicker } from './TargetPicker';
import { useKeyboardHide } from './useKeyboardHide';
import type { AuditTarget } from '../../../../lib/siteAuditLogic';

/**
 * 7 Nov 2026 bug (iPhone): in Change van, typing in the search hides the sheet's Next / Cancel (correct),
 * but picking a van left them hidden until another tap. The focused search box was removed from the page
 * on pick, browsers send no "focus left" signal for a removed box, so the "keyboard open" state stuck.
 */
const targets = [
  { key: 'van:v3', kind: 'spare_van', vehicleId: 'v3', label: 'OW72 SGV · spare van', isGanger: false },
  { key: 'person:e2', kind: 'person', personId: 'e2', vehicleId: 'v2', label: 'Sam Longcroft · WV72 OZL', isGanger: true },
] as unknown as AuditTarget[];

function SheetLike() {
  useKeyboardHide();
  const [value, setValue] = useState('');
  return <TargetPicker label="New van" targets={targets} value={value} onChange={setValue} />;
}

afterEach(() => cleanup());

describe('picking from a list closes the keyboard and brings the sheet buttons back', () => {
  it('typing in the search hides the buttons (kb-open)', async () => {
    render(<SheetLike />);
    const box = screen.getByRole('combobox');
    box.focus();
    fireEvent.focusIn(box);
    await waitFor(() => expect(document.documentElement.classList.contains('kb-open')).toBe(true));
  });

  it('picking a van clears it with no other tap, and the search box no longer has focus', async () => {
    render(<SheetLike />);
    const box = screen.getByRole('combobox');
    box.focus();
    fireEvent.focusIn(box);
    fireEvent.change(box, { target: { value: 'OW' } });
    await waitFor(() => expect(document.documentElement.classList.contains('kb-open')).toBe(true));
    const option = screen.getByRole('option', { name: /OW72 SGV/ });
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(screen.getByText('OW72 SGV · spare van')).toBeTruthy(); // the van shows as chosen
    await waitFor(() => expect(document.documentElement.classList.contains('kb-open')).toBe(false), { timeout: 1500 });
    expect(document.activeElement?.tagName).not.toBe('INPUT');
  });
});
