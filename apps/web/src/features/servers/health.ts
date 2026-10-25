/** The health report of one server check, as `health/analyze.py` writes it (`summary`). */
export interface HealthFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  area: string;
  title: string;
  detail: string;
  recommendation: string;
}

export interface HealthSummary {
  platform: 'windows' | 'linux';
  collected_at: string;
  complete: boolean;
  score: number;
  grade: string;
  status: 'healthy' | 'attention' | 'at_risk' | 'critical';
  counts: Record<string, number>;
  os: {
    name: string;
    version: string;
    kernel: string;
    hostname: string;
    architecture: string;
    uptime_days: number | null;
    virtualization: string;
    lifecycle: { label: string; end_of_support: string | null; days_left: number | null };
  };
  cpu: { model: string; cores: number; load_pct: number };
  memory: { total: number; available: number; used_pct: number; swap_total: number; swap_used_pct: number };
  disks: { mount: string; filesystem: string; size: number; free: number; used_pct: number; inodes_pct: number | null }[];
  patches: {
    checked: boolean;
    pending: number;
    security: number;
    critical: number;
    last_patched: string | null;
    days_since_patch: number | null;
    reboot_pending: boolean;
    items: { name: string; id: string; severity: string; security: boolean; cves: string[] }[];
  };
  vulnerabilities: { id: string; severity: string; source: string }[];
  logs: { critical: number; errors: number; warnings: number; top: { source: string; count: number; last: string; message: string }[] };
  services: { failed: { name: string; display_name: string; state: string }[] };
  security: { key: string; label: string; status: 'pass' | 'fail' | 'unknown'; detail: string }[];
  network: { listening: { protocol: string; port: number; address: string; process: string }[] };
  findings: HealthFinding[];
}

export const STATUS_LABEL: Record<HealthSummary['status'], string> = {
  healthy: 'Healthy',
  attention: 'Needs attention',
  at_risk: 'At risk',
  critical: 'Critical',
};

export const STATUS_TONE: Record<HealthSummary['status'], 'success' | 'warning' | 'high' | 'danger'> = {
  healthy: 'success',
  attention: 'warning',
  at_risk: 'high',
  critical: 'danger',
};

export function gigabytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  const gb = bytes / 1024 ** 3;
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

/** The stored summary is JSON: trust its shape only as far as the fields this page reads. */
export function asSummary(value: unknown): HealthSummary | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<HealthSummary>;
  if (typeof s.score !== 'number' || !s.os || !Array.isArray(s.findings)) return null;
  return s as HealthSummary;
}
