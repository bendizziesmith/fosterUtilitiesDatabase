import { useEffect } from 'react';
import { isTypingField, keyboardLooksOpen } from '../../../../lib/phoneInput';

/**
 * Phones: while the keyboard is open, hide the fixed bottom bar and the audit footer (anything
 * with the kb-hide class, see index.css). They hide at once, and come back only once no box has
 * focus and the visible screen is full height again, so nothing jumps or flickers on the way back
 * (moving from one box to the next keeps them hidden).
 * Bottom sheets (Change van, Swap, Issue to, Add kit…) hide their Next / Cancel footer the same way, and
 * --vv-top / --vv-height (the part of the screen above the keyboard) let them fit in it.
 */
export function useKeyboardHide() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport ?? null;
    let timer: number | undefined;
    const setVisibleArea = () => {
      if (!vv) return;
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      root.style.setProperty('--vv-height', `${vv.height}px`);
    };
    const looksOpen = () =>
      keyboardLooksOpen({
        typing: isTypingField(document.activeElement as HTMLInputElement | null),
        innerHeight: window.innerHeight,
        viewportHeight: vv ? vv.height : null,
      });
    const update = () => {
      setVisibleArea();
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
    vv?.addEventListener('scroll', setVisibleArea);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', setVisibleArea);
      root.classList.remove('kb-open');
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
    };
  }, []);
}
