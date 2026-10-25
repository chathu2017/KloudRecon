import * as React from 'react';

/**
 * Reveals `.reveal` children once as they scroll into view (one reveal per section; decision
 * 0043). Without JavaScript, or with reduced motion, everything is simply shown.
 */
export function useReveal<T extends HTMLElement>(): React.RefObject<T> {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Anything already on screen (e.g. taking over a prerendered page) stays visible: no re-hide.
    root.querySelectorAll('.reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-visible');
    });
    root.classList.add('js-reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            observer.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    root.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return ref;
}
