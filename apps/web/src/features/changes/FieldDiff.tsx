function isComposite(value: unknown): boolean {
  if (typeof value === 'object' && value !== null) return true;
  return typeof value === 'string' && /^[[{]/.test(value.trim());
}

function short(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** One changed field: `path: before → after`, or "added" / "removed" for whole list items. */
export function FieldDiff({
  path,
  before,
  after,
}: {
  path: string;
  before: unknown;
  after: unknown;
}) {
  const gone = after === null || after === undefined;
  const fresh = before === null || before === undefined;
  if (isComposite(before) || isComposite(after)) {
    const verb = fresh ? 'added' : gone ? 'removed' : 'changed';
    const tone = fresh ? 'text-success-strong' : gone ? 'text-critical-strong' : 'text-brand-strong';
    return (
      <li className="truncate">
        {path}: <span className={tone}>{verb}</span>
      </li>
    );
  }
  return (
    <li className="truncate">
      {path}: <span className="text-critical-strong line-through">{short(before)}</span> →{' '}
      <span className="text-success-strong">{short(after)}</span>
    </li>
  );
}
