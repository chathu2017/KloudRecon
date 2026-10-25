/**
 * Pointer spotlight for `.glow-card` (decision 0045): one passive document listener writes the
 * pointer position into `--mx` / `--my` on the hovered card; the CSS draws the highlight.
 */
let installed = false;

export function installSpotlight(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  let frame = 0;
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = e.target instanceof Element ? e.target.closest<HTMLElement>('.glow-card') : null;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        card.style.setProperty('--my', `${e.clientY - rect.top}px`);
      });
    },
    { passive: true },
  );
}
