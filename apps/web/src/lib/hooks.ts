import * as React from 'react';

/** Current time that re-renders on an interval (keeps render functions pure). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const noSubscribe = () => () => undefined;

/**
 * False while React hydrates prerendered HTML (decision 0043), true afterwards and in normal
 * client renders. For UI whose markup cannot match the prerendered snapshot, such as generated
 * ids: render a stand-in first, the real thing once hydrated.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
