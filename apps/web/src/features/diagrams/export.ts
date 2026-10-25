/**
 * Diagram exports (plan 9.3): SVG, PNG (2x), PDF and draw.io.
 *
 * Everything is rendered from the scene and its ELK layout, not scraped from the DOM, so the
 * files are clean and self-contained: official icons are inlined as data URIs and theme colours
 * (CSS variables) are resolved to literal colours of the current theme.
 */
import { iconPath, groupIconUrl, ICON_BASE } from './icons';
import type { Layout, Point } from './layout';
import type { NodeOverlay, OverlayResult } from './overlay';
import type { Scene, SceneNode } from './scene';
import { arrowHead, chipText, compactCost, DEFAULT_GROUP, edgeStyle, elbow, GROUP_STYLES, midpoint, roundedPath } from './styles';

export interface ExportInput {
  title: string;
  subtitle: string;
  scene: Scene;
  layout: Layout;
  overlay: OverlayResult | null;
  showCost: boolean;
  security: boolean;
  notes: { text: string; color: string; position: Record<string, number> }[];
}

const MARGIN = 32;
const TITLE_H = 64;
const FONT = "'Manrope', 'Segoe UI', system-ui, sans-serif";

// ---- colours & icons ----------------------------------------------------------------------------
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** `var(--x)` (possibly nested) → literal colour of the current theme. */
export function resolveColor(value: string): string {
  let v = value.trim();
  for (let i = 0; i < 5; i += 1) {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (!m?.[1]) break;
    v = cssVar(m[1]);
  }
  return v || '#888888';
}

/** Literal colour → `#rrggbb` + opacity (draw.io understands only hex). */
export function toHex(color: string): { hex: string; opacity: number } {
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return { hex: c.toLowerCase(), opacity: 1 };
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    const [r, g, b] = c.slice(1).split('');
    return { hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), opacity: 1 };
  }
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i.exec(c);
  if (m) {
    const hex = [m[1], m[2], m[3]].map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('');
    const a = m[4] ? (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    return { hex: `#${hex}`, opacity: a };
  }
  if (c === 'transparent') return { hex: '#ffffff', opacity: 0 };
  return { hex: '#888888', opacity: 1 };
}

const iconCache = new Map<string, string>();

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function iconBase64(url: string): Promise<string> {
  const cached = iconCache.get(url);
  if (cached) return cached;
  const text = await (await fetch(url)).text();
  const b64 = toBase64(text);
  iconCache.set(url, b64);
  return b64;
}

function nodeIconUrl(n: SceneNode): string | null {
  if (n.kind === 'collapsed') return groupIconUrl(n.groupKind ?? '');
  if (n.type === 'external/internet') return null;
  return ICON_BASE + iconPath(n.type, n.resourceKind);
}

const GLOBE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#3d4fe0" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';

async function iconMap(scene: Scene): Promise<Map<string, string>> {
  const urls = new Set<string>();
  for (const n of scene.nodes) {
    const u = nodeIconUrl(n);
    if (u) urls.add(u);
  }
  for (const g of scene.groups) {
    const u = groupIconUrl(g.kind);
    if (u) urls.add(u);
  }
  const out = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (u) => {
      try {
        out.set(u, await iconBase64(u));
      } catch {
        /* missing icon: the shape is still exported */
      }
    }),
  );
  out.set('globe', toBase64(GLOBE_SVG));
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrap(text: string, maxChars: number, lines = 2): string[] {
  const words = text.split(/(?<=[-_. ])/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + w).length > maxChars && cur) {
      out.push(cur);
      cur = w;
    } else cur += w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${(kept[lines - 1] ?? '').slice(0, maxChars - 1)}…`;
    return kept;
  }
  return out.map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
}

// ---- SVG ----------------------------------------------------------------------------------------
export async function toSvg(input: ExportInput): Promise<{ svg: string; width: number; height: number }> {
  const { scene, layout, overlay } = input;
  const icons = await iconMap(scene);
  const c = (v: string) => resolveColor(v);
  const width = Math.ceil(layout.width + MARGIN * 2);
  const height = Math.ceil(layout.height + MARGIN * 2 + TITLE_H);
  const ox = MARGIN;
  const oy = MARGIN + TITLE_H;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(FONT)}">`,
    `<rect width="100%" height="100%" fill="${c('var(--dg-canvas)')}"/>`,
    `<text x="${MARGIN}" y="${MARGIN + 22}" font-size="22" font-weight="600" fill="${c('var(--text)')}">${esc(input.title)}</text>`,
    `<text x="${MARGIN}" y="${MARGIN + 44}" font-size="12.5" fill="${c('var(--text-muted)')}">${esc(input.subtitle)}</text>`,
  );
  // containers (parents first)
  const depth = (id: string) => {
    let d = 0;
    let p = scene.groups.find((g) => g.id === id)?.parent ?? null;
    while (p) {
      d += 1;
      const pid: string = p;
      p = scene.groups.find((g) => g.id === pid)?.parent ?? null;
    }
    return d;
  };
  for (const g of [...scene.groups].sort((a, b) => depth(a.id) - depth(b.id))) {
    const b = layout.absolute.get(g.id);
    if (!b) continue;
    const s = GROUP_STYLES[g.kind] ?? DEFAULT_GROUP;
    const x = ox + b.x;
    const y = oy + b.y;
    parts.push(
      `<rect x="${x}" y="${y}" width="${b.width}" height="${b.height}" rx="12" fill="${c(s.bg)}" stroke="${c(s.border)}" stroke-width="${s.width}"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/>`,
    );
    const icon = groupIconUrl(g.kind);
    const data = icon ? icons.get(icon) : undefined;
    let tx = x + 12;
    if (data && g.kind !== 'aggregate') {
      parts.push(`<image href="data:image/svg+xml;base64,${data}" x="${x + 12}" y="${y + 13}" width="18" height="18"/>`);
      tx += 26;
    }
    const maxChars = Math.max(8, Math.floor((b.width - (tx - x) - 12) / 7.2));
    const label = g.label.length > maxChars ? `${g.label.slice(0, maxChars - 1)}…` : g.label;
    parts.push(`<text x="${tx}" y="${y + 22}" font-size="13" font-weight="600" fill="${c(s.text)}">${esc(label)}</text>`);
    const role = g.badges.find((x) => x === 'Hub' || x === 'Spoke');
    if (role) {
      const rx = tx + label.length * 7.4 + 8;
      parts.push(
        `<rect x="${rx}" y="${y + 11}" width="${role.length * 7 + 10}" height="15" rx="3" fill="none" stroke="${c(s.border)}"/>`,
        `<text x="${rx + (role.length * 7 + 10) / 2}" y="${y + 22}" font-size="9.5" font-weight="700" letter-spacing="0.6" text-anchor="middle" fill="${c(s.text)}">${role.toUpperCase()}</text>`,
      );
    }
    let cx = tx;
    if (g.sublabel) {
      parts.push(`<text x="${tx}" y="${y + 37}" font-size="11" fill="${c('var(--text-muted)')}">${esc(g.sublabel)}</text>`);
      cx += g.sublabel.length * 6 + 8;
    }
    for (const badge of g.badges.filter((x) => x !== 'Hub' && x !== 'Spoke').slice(0, 2)) {
      const text = chipText(badge);
      const w = text.length * 5.4 + 8;
      if (cx + w > x + b.width - 8) break;
      parts.push(
        `<rect x="${cx}" y="${y + 28}" width="${w}" height="13" rx="3" fill="${c('var(--surface-2)')}"/>`,
        `<text x="${cx + w / 2}" y="${y + 37.5}" font-size="9.5" font-weight="500" text-anchor="middle" fill="${c('var(--text-muted)')}">${esc(text)}</text>`,
      );
      cx += w + 4;
    }
  }
  // edges (the detailed view writes each link's label on a small plate, drawn above all lines)
  const labels: { at: Point; text: string; dimmed: boolean }[] = [];
  const drawEdge = (pts: Point[], kind: string, label: string, dimmed: boolean) => {
    const s = edgeStyle(kind, input.security);
    const shifted = pts.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    const color = c(s.color);
    const op = dimmed ? ' opacity="0.15"' : '';
    parts.push(
      `<path d="${roundedPath(shifted)}" fill="none" stroke="${color}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${op}/>`,
    );
    const last = shifted[shifted.length - 1] as Point;
    const prev = shifted[shifted.length - 2] as Point;
    if (s.arrows !== 'none') parts.push(`<path d="${arrowHead(prev, last)}" fill="${color}"${op}/>`);
    if (s.arrows === 'both') parts.push(`<path d="${arrowHead(shifted[1] as Point, shifted[0] as Point)}" fill="${color}"${op}/>`);
    if (label && kind === 'path') {
      const m = shifted[Math.floor(shifted.length / 2)] as Point;
      parts.push(`<text x="${m.x + 4}" y="${m.y - 4}" font-size="10.5" fill="${color}">${esc(label)}</text>`);
    } else if (label && scene.labels) {
      labels.push({ at: midpoint(shifted), text: label.length > 26 ? `${label.slice(0, 25)}…` : label, dimmed });
    }
  };
  const pathActive = (overlay?.pathNodes.size ?? 0) > 0;
  for (const e of scene.edges) {
    const pts = layout.routes.get(e.id);
    if (!pts) continue;
    const on = overlay?.pathNodes.has(e.source) && overlay.pathNodes.has(e.target);
    drawEdge(pts, e.kind, e.label, pathActive && !on);
  }
  for (const link of overlay?.pathLinks ?? []) {
    const a = layout.absolute.get(link.source);
    const b = layout.absolute.get(link.target);
    if (a && b) drawEdge(elbow(a, b), 'path', link.label, false);
  }
  for (const l of labels) {
    const w = l.text.length * 5.6 + 10;
    const op = l.dimmed ? ' opacity="0.2"' : '';
    parts.push(
      `<rect x="${l.at.x - w / 2}" y="${l.at.y - 8}" width="${w}" height="16" rx="4" fill="${c('var(--surface)')}" stroke="${c('var(--border)')}"${op}/>`,
      `<text x="${l.at.x}" y="${l.at.y + 3.5}" font-size="10" font-weight="500" text-anchor="middle" fill="${c('var(--text-muted)')}"${op}>${esc(l.text)}</text>`,
    );
  }
  // nodes
  for (const n of scene.nodes) {
    const b = layout.absolute.get(n.id);
    if (!b) continue;
    parts.push(nodeSvg(n, { ...b, x: ox + b.x, y: oy + b.y }, overlay?.nodes.get(n.id), icons, input.showCost));
  }
  // notes
  for (const note of input.notes) {
    const x = ox + (note.position.x ?? 0);
    const y = oy + (note.position.y ?? 0);
    const bg = { yellow: 'var(--medium-soft)', blue: 'var(--brand-soft)', green: 'var(--success-soft)', pink: 'var(--high-soft)' }[note.color] ?? 'var(--medium-soft)';
    parts.push(`<rect x="${x}" y="${y}" width="180" height="110" rx="6" fill="${c(bg)}" stroke="${c('var(--border-strong)')}"/>`);
    wrap(note.text, 28, 6).forEach((line, i) =>
      parts.push(`<text x="${x + 10}" y="${y + 20 + i * 15}" font-size="12" fill="${c('var(--text)')}">${esc(line)}</text>`),
    );
  }
  parts.push(
    `<text x="${width - MARGIN}" y="${height - 12}" font-size="10" text-anchor="end" fill="${c('var(--text-subtle)')}">Generated by KloudRecon · Microsoft Azure icons used under Microsoft's terms</text>`,
    '</svg>',
  );
  return { svg: parts.join('\n'), width, height };
}

function nodeSvg(n: SceneNode, b: { x: number; y: number; width: number; height: number }, o: NodeOverlay | undefined, icons: Map<string, string>, showCost: boolean): string {
  const c = resolveColor;
  const ring = o?.onPath || o?.exposure ? 'var(--dg-exposure)' : o?.change === 'added' ? 'var(--success)' : o?.change === 'modified' ? 'var(--medium)' : null;
  const ghost = n.kind === 'ghost';
  const internet = n.type === 'external/internet';
  const out: string[] = [];
  const fill = n.kind === 'external' ? 'var(--surface-2)' : 'var(--dg-node)';
  out.push(
    `<g${o?.dimmed ? ' opacity="0.18"' : ghost ? ' opacity="0.55"' : ''}>`,
    `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${internet ? 48 : 10}" fill="${c(fill)}" stroke="${c(ring ?? 'var(--dg-node-border)')}" stroke-width="${ring ? 2 : 1}"${ghost || n.kind === 'collapsed' ? ' stroke-dasharray="5 4"' : ''}/>`,
  );
  const url = nodeIconUrl(n);
  const data = url ? icons.get(url) : icons.get('globe');
  if (data) out.push(`<image href="data:image/svg+xml;base64,${data}" x="${b.x + b.width / 2 - 20}" y="${b.y + 12}" width="40" height="40"/>`);
  const lines = wrap(n.label, Math.floor((b.width - 12) / 6.9));
  lines.forEach((line, i) =>
    out.push(`<text x="${b.x + b.width / 2}" y="${b.y + 66 + i * 15}" font-size="12.5" font-weight="500" text-anchor="middle" fill="${c('var(--text)')}">${esc(line)}</text>`),
  );
  const sub = ghost ? 'removed' : n.sublabel;
  if (sub) {
    out.push(
      `<text x="${b.x + b.width / 2}" y="${b.y + 66 + lines.length * 15}" font-size="11" text-anchor="middle" fill="${c('var(--text-muted)')}">${esc(sub.length > 24 ? `${sub.slice(0, 23)}…` : sub)}</text>`,
    );
  }
  if (n.kind === 'aggregate' || n.kind === 'collapsed') {
    const label = `×${n.count}`;
    const w = label.length * 7 + 10;
    out.push(
      `<rect x="${b.x + b.width - w + 8}" y="${b.y - 8}" width="${w}" height="17" rx="8.5" fill="${c('var(--surface)')}" stroke="${c('var(--border)')}"/>`,
      `<text x="${b.x + b.width - w / 2 + 8}" y="${b.y + 4}" font-size="11" font-weight="600" text-anchor="middle" fill="${c('var(--text)')}">${label}</text>`,
    );
  }
  if (o?.findings) {
    const color = { critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', info: 'var(--info)' }[o.findings.top];
    out.push(
      `<rect x="${b.x - 8}" y="${b.y - 8}" width="28" height="17" rx="8.5" fill="${c(color)}"/>`,
      `<text x="${b.x + 6}" y="${b.y + 4}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#ffffff">${o.findings.total}</text>`,
    );
  }
  if (o?.exposure?.ports.length) {
    const text = o.exposure.ports.join(' · ');
    const w = text.length * 5.8 + 12;
    out.push(
      `<rect x="${b.x + b.width / 2 - w / 2}" y="${b.y + b.height - 8}" width="${w}" height="16" rx="8" fill="${c('var(--critical)')}"/>`,
      `<text x="${b.x + b.width / 2}" y="${b.y + b.height + 3.5}" font-size="10" font-weight="600" text-anchor="middle" fill="#ffffff">${esc(text)}</text>`,
    );
  }
  if (showCost && o?.cost !== undefined) {
    const text = `${compactCost(o.cost, 'USD')}/mo`;
    const w = text.length * 5.8 + 10;
    out.push(
      `<rect x="${b.x + b.width - w - 12}" y="${b.y - 8}" width="${w}" height="16" rx="8" fill="${c('var(--surface)')}" stroke="${c('var(--border)')}"/>`,
      `<text x="${b.x + b.width - w / 2 - 12}" y="${b.y + 3.5}" font-size="10" text-anchor="middle" fill="${c('var(--text-muted)')}">${esc(text)}</text>`,
    );
    if (o.costLevel !== undefined) {
      out.push(`<rect x="${b.x + 1}" y="${b.y + b.height - 6}" width="${b.width - 2}" height="5" fill="${c(`var(--seq-${Math.min(6, o.costLevel + 1)})`)}"/>`);
    }
  }
  out.push('</g>');
  return out.join('');
}

// ---- PNG & PDF ----------------------------------------------------------------------------------
async function toCanvas(svg: string, width: number, height: number, scale: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The diagram could not be rasterised.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function toPng(input: ExportInput, scale = 2): Promise<Blob> {
  const { svg, width, height } = await toSvg(input);
  // browsers cap canvas size; keep the 2x export under ~16k px per side
  const s = Math.min(scale, 16000 / Math.max(width, height));
  const canvas = await toCanvas(svg, width, height, s);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed.'))), 'image/png'));
}

/** A one-page PDF with the diagram as a JPEG (DCTDecode) image, sized to the diagram. */
export function buildPdf(jpeg: Uint8Array, pixelW: number, pixelH: number, title: string): Uint8Array {
  const maxW = 1190; // A3 landscape width in points; larger diagrams are scaled down
  const pageW = Math.min(maxW, pixelW / 2);
  const pageH = (pageW * pixelH) / pixelW;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  const safeTitle = title.replace(/[()\\]/g, '');
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelW} /Height ${pixelH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${safeTitle}) /Producer (KloudRecon) >>`);
  const xref = length;
  let table = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i += 1) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let pos = 0;
  for (const ch of chunks) {
    out.set(ch, pos);
    pos += ch.length;
  }
  return out;
}

export async function toPdf(input: ExportInput): Promise<Blob> {
  const { svg, width, height } = await toSvg(input);
  const scale = Math.min(2, 9000 / Math.max(width, height));
  const canvas = await toCanvas(svg, width, height, scale);
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha: paint the canvas colour behind transparent areas
  if (ctx) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = resolveColor('var(--dg-canvas)');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) jpeg[i] = bin.charCodeAt(i);
  const pdf = buildPdf(jpeg, canvas.width, canvas.height, input.title);
  return new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// ---- draw.io ------------------------------------------------------------------------------------
function style(entries: Record<string, string | number | undefined>): string {
  return Object.entries(entries)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(';');
}

/** mxGraph XML that diagrams.net / draw.io opens: nested containers, image shapes with the
 *  official icons (inline data URIs, so no library is needed) and orthogonal edges with waypoints. */
export async function toDrawio(input: ExportInput): Promise<string> {
  const { scene, layout } = input;
  const icons = await iconMap(scene);
  const ids = new Map<string, string>();
  let seq = 2;
  const cellId = (id: string) => {
    let v = ids.get(id);
    if (!v) {
      v = `c${seq}`;
      seq += 1;
      ids.set(id, v);
    }
    return v;
  };
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const hex = (v: string) => toHex(resolveColor(v));
  const depth = (id: string | null): number => {
    let d = 0;
    let p = id;
    while (p) {
      d += 1;
      const pid: string = p;
      p = scene.groups.find((g) => g.id === pid)?.parent ?? null;
    }
    return d;
  };
  for (const g of [...scene.groups].sort((a, b) => depth(a.parent) - depth(b.parent))) {
    const b = layout.boxes.get(g.id);
    if (!b) continue;
    const s = GROUP_STYLES[g.kind] ?? DEFAULT_GROUP;
    const fill = hex(s.bg);
    const stroke = hex(s.border);
    const text = hex(s.text);
    const value = g.sublabel ? `<b>${esc(g.label)}</b><br><font style="font-size:10px">${esc(g.sublabel)}</font>` : `<b>${esc(g.label)}</b>`;
    cells.push(
      `<mxCell id="${cellId(g.id)}" value="${esc(value)}" style="${style({
        rounded: 1,
        arcSize: 3,
        whiteSpace: 'wrap',
        html: 1,
        container: 1,
        collapsible: 0,
        dashed: s.dashed ? 1 : 0,
        fillColor: fill.opacity < 0.05 ? 'none' : fill.hex,
        fillOpacity: Math.round(fill.opacity * 100),
        strokeColor: stroke.hex,
        strokeWidth: s.width,
        fontColor: text.hex,
        verticalAlign: 'top',
        align: 'left',
        spacingLeft: 34,
        spacingTop: 4,
        fontSize: 12,
      })}" vertex="1" parent="${g.parent ? cellId(g.parent) : '1'}"><mxGeometry x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" as="geometry"/></mxCell>`,
    );
    const icon = groupIconUrl(g.kind);
    const data = icon ? icons.get(icon) : undefined;
    if (data && g.kind !== 'aggregate') {
      cells.push(
        `<mxCell id="${cellId(`${g.id}#icon`)}" value="" style="image;aspect=fixed;html=1;points=[];image=data:image/svg+xml,${data}" vertex="1" parent="${cellId(g.id)}"><mxGeometry x="10" y="12" width="18" height="18" as="geometry"/></mxCell>`,
      );
    }
  }
  const textColor = hex('var(--text)').hex;
  for (const n of scene.nodes) {
    const b = layout.boxes.get(n.id);
    if (!b) continue;
    const url = nodeIconUrl(n);
    const data = url ? icons.get(url) : icons.get('globe');
    const label = n.kind === 'aggregate' || n.kind === 'collapsed' ? `${n.label} (×${n.count})` : n.label;
    const value = n.sublabel ? `${esc(label)}<br><font style="font-size:10px" color="#4a5273">${esc(n.sublabel)}</font>` : esc(label);
    // the icon shape sits centred in the node's box; its label goes below the icon
    cells.push(
      `<mxCell id="${cellId(n.id)}" value="${esc(value)}" style="${style({
        image: undefined,
        aspect: 'fixed',
        html: 1,
        points: '[]',
        align: 'center',
        fontSize: 12,
        fontColor: textColor,
        verticalLabelPosition: 'bottom',
        verticalAlign: 'top',
        imageAspect: 0,
        whiteSpace: 'wrap',
        dashed: n.kind === 'ghost' ? 1 : undefined,
        opacity: n.kind === 'ghost' ? 50 : undefined,
      })};shape=image;image=data:image/svg+xml,${data ?? ''}" vertex="1" parent="${n.parent ? cellId(n.parent) : '1'}"><mxGeometry x="${b.x + b.width / 2 - 24}" y="${b.y + 6}" width="48" height="48" as="geometry"/></mxCell>`,
    );
  }
  for (const e of scene.edges) {
    const pts = layout.routes.get(e.id);
    if (!pts || !ids.has(e.source) || !ids.has(e.target)) continue;
    const s = edgeStyle(e.kind, input.security);
    const color = hex(s.color).hex;
    const bends = pts.slice(1, -1);
    cells.push(
      `<mxCell id="${cellId(`edge:${e.id}`)}" value="${esc(e.label)}" style="${style({
        edgeStyle: 'orthogonalEdgeStyle',
        rounded: 1,
        orthogonalLoop: 1,
        html: 1,
        strokeColor: color,
        strokeWidth: s.width,
        dashed: s.dash ? 1 : 0,
        dashPattern: s.dash,
        endArrow: s.arrows === 'none' ? 'none' : 'block',
        endFill: 1,
        startArrow: s.arrows === 'both' ? 'block' : 'none',
        startFill: 1,
        fontSize: 10,
        fontColor: color,
        labelBackgroundColor: 'default',
      })}" edge="1" parent="1" source="${cellId(e.source)}" target="${cellId(e.target)}"><mxGeometry relative="1" as="geometry">${
        bends.length ? `<Array as="points">${bends.map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('')}</Array>` : ''
      }</mxGeometry></mxCell>`,
    );
  }
  input.notes.forEach((note, i) => {
    cells.push(
      `<mxCell id="note${i}" value="${esc(esc(note.text))}" style="shape=note;whiteSpace=wrap;html=1;size=14;fillColor=#fdf1e1;strokeColor=#c2c9df;align=left;verticalAlign=top;spacing=8;fontSize=12;" vertex="1" parent="1"><mxGeometry x="${note.position.x ?? 0}" y="${note.position.y ?? 0}" width="180" height="110" as="geometry"/></mxCell>`,
    );
  });
  const w = Math.ceil(layout.width);
  const h = Math.ceil(layout.height);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<mxfile host="KloudRecon" type="device" version="24.0.0">`,
    `<diagram id="kloudrecon" name="${esc(input.title)}">`,
    `<mxGraphModel dx="${w}" dy="${h}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0">`,
    `<root>${cells.join('')}</root>`,
    '</mxGraphModel>',
    '</diagram>',
    '</mxfile>',
  ].join('\n');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileStem(title: string): string {
  return `kloudrecon-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}
