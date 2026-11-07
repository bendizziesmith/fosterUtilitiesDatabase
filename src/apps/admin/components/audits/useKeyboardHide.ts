import { useEffect } from 'react';
import { isTypingField, keyboardLooksOpen } from '../../../../lib/phoneInput';

/**
 * Phones: while the keyboard is open, hide the fixed bottom bar and the audit footer (anything
 * with the kb-hide class, see index.css). They hide at once, and come back only once no box has
 * focus and the visible screen is full height again, so nothing jumps or flickers on the way back
 * (moving from one box to the next keeps them hidden).
 */
export function useKeyboardHide() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport ?? null;
    let timer: number | undefined;
    const looksOpen = () =>
      keyboardLooksOpen({
        typing: isTypingField(document.activeElement as HTMLInputElement | null),
        innerHeight: window.innerHeight,
        viewportHeight: vv ? vv.height : null,
      });
    const update = () => {
      window.clearTimeout(timer);
      if (looksOpen()) {
        root.classList.add('kb-open');
        return;
      }
      // wait for the keyboard to finish closing before the bars come back
      timer = window.setTimeout(() => {
        if (!looksOpen()) root.classList.remove('kb-open');
      }, 250);
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    vv?.addEventListener('resize', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      vv?.removeEventListener('resize', update);
      root.classList.remove('kb-open');
    };
  }, []);
}
