import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { nextPlantMode, plantKeyboard, PlantMode } from '../../../../lib/phoneInput';
import { inputCls } from './styles';

/**
 * Plant no box: opens the number pad; the small "ABC" button next to it switches that box to the
 * normal keyboard (it then shows "123" to switch back). Focus and what's typed are kept, and
 * letters are saved exactly as typed.
 */
export function PlantNoInput({ id, value, onChange, label = 'plant no' }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** for the switch button's screen-reader name */
  label?: string;
}) {
  const [mode, setMode] = useState<PlantMode>('numbers');
  const ref = useRef<HTMLInputElement>(null);
  const kb = plantKeyboard(mode);

  const toggle = () => {
    const el = ref.current;
    const hadFocus = !!el && document.activeElement === el;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    // apply the new keyboard type now, inside the tap, so the phone can show the other keyboard
    flushSync(() => setMode(nextPlantMode(mode)));
    if (el && hadFocus) {
      // phones only swap keyboards when the box is focused again
      el.blur();
      el.focus({ preventScroll: true });
      if (start !== null && end !== null) {
        try {
          el.setSelectionRange(start, end);
        } catch {
          /* some input types don't allow it */
        }
      }
    }
  };

  return (
    <div className="flex gap-2 min-w-0">
      <input
        ref={ref}
        id={id}
        className={`${inputCls} flex-1 min-w-0`}
        value={value}
        inputMode={kb.inputMode}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={`${kb.buttonLabel} for ${label}`}
        // keep the box focused (and the keyboard up) while the button is pressed
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="flex-shrink-0 min-w-[48px] min-h-[48px] sm:min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {kb.button}
      </button>
    </div>
  );
}
