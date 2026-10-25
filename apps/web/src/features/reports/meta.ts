import {
  BookOpenCheck,
  ClipboardCheck,
  FileBarChart,
  FileSignature,
  FileText,
  GitCompareArrows,
  HeartPulse,
  Network,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

export type ReportType = 'audit' | 'server_health' | 'executive' | 'full' | 'security' | 'compliance' | 'finops' | 'architecture' | 'changes';

export const REPORT_TYPES: { key: ReportType; title: string; description: string; icon: LucideIcon; audience: string; format?: 'Word' }[] = [
  {
    key: 'audit',
    title: 'Audit report (Word)',
    description: 'The full audit document for sign-off: cover, approval page, findings, recommendations and a financial summary. Editable in Word.',
    icon: FileSignature,
    audience: 'Management, auditors',
    format: 'Word',
  },
  {
    key: 'server_health',
    title: 'Server health report (Word)',
    description: 'The servers you checked under Server health: capacity, patches, vulnerabilities, errors, security settings and recommendations per server.',
    icon: HeartPulse,
    audience: 'Infrastructure, auditors',
    format: 'Word',
  },
  { key: 'executive', title: 'Executive one-pager', description: 'Score, top risks, spend and savings on one page.', icon: FileText, audience: 'Leadership' },
  { key: 'full', title: 'Full assessment', description: 'Every chapter: security, compliance, reliability, governance, FinOps, architecture.', icon: BookOpenCheck, audience: 'Consultants, IT' },
  { key: 'security', title: 'Security & attack paths', description: 'Exposure, attack paths, prioritized fix plan, vulnerabilities.', icon: ShieldAlert, audience: 'Security' },
  { key: 'compliance', title: 'Compliance audit pack', description: 'Controls mapped to one framework, with evidence per control.', icon: ClipboardCheck, audience: 'Audit, GRC' },
  { key: 'finops', title: 'FinOps', description: 'Trend, forecast, anomalies, rightsizing, waste, commitments, showback.', icon: FileBarChart, audience: 'Finance' },
  { key: 'architecture', title: 'Architecture document', description: 'Diagrams, address plan, components and a Well-Architected review.', icon: Network, audience: 'Architects' },
  { key: 'changes', title: 'Changes report', description: 'What changed, who changed it and which changes are risky.', icon: GitCompareArrows, audience: 'Operations' },
];

export function typeTitle(key: string): string {
  return REPORT_TYPES.find((t) => t.key === key)?.title ?? key;
}
