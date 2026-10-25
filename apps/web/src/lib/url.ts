/**
 * True for same-origin app paths only ("/app/team?x=1"). Rejects protocol-relative ("//evil"),
 * backslash tricks ("/\\evil" — browsers treat "\" like "/"), absolute URLs and control chars,
 * so `?next=` and post-login return paths can never become open redirects.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith('/')) return false;
  if (path.startsWith('//') || path.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return true;
}
