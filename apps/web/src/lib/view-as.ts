/**
 * Platform owner's read-only view of a customer organization (decision 0039). The signed grant
 * lives in sessionStorage (this tab only) and is sent as `X-KloudRecon-View-As` on every API
 * call; the API answers as a read-only viewer of that organization and refuses all writes.
 */

const KEY = 'kr.viewAs';

export interface ViewAs {
  token: string;
  orgId: string;
  orgName: string;
  expiresAt: number;
}

export function getViewAs(): ViewAs | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ViewAs;
    if (!value.token || value.expiresAt < Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function startViewAs(value: ViewAs): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the view simply does not start */
  }
}

export function stopViewAs(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Extra headers for raw fetch calls (SSE, downloads, chat). */
export function viewAsHeaders(): Record<string, string> {
  const v = getViewAs();
  return v ? { 'X-KloudRecon-View-As': v.token } : {};
}
