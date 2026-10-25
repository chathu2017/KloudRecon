/**
 * Report diagram renderer (decision 0036): the app's own scene → ELK layout → SVG export, bundled
 * into one self-contained script for the PDF reports (`npm run build:renderer`). The report page
 * calls `window.KRDiagram.render(graph, title)`; icons and design tokens are embedded, nothing is
 * fetched from the network.
 */
import icons from 'virtual:report-icons';
import tokensCss from '@/styles/tokens.css?raw';
import type { DiagramGraph } from './api';
import { toSvg } from './export';
import { ICON_BASE } from './icons';
import { layoutScene } from './layout';
import { autoCollapse, buildScene } from './scene';

declare global {
  interface Window {
    KRDiagram: { render: (graph: DiagramGraph, title: string) => Promise<string> };
  }
}

function installTokens(): void {
  if (document.getElementById('kr-tokens')) return;
  const style = document.createElement('style');
  style.id = 'kr-tokens';
  style.textContent = tokensCss;
  document.head.appendChild(style);
}

// The app lays out in a web worker; the report page is a single document, so ELK runs in-thread
// (layout.ts takes the bundled ELK when `Worker` is not available).
Object.defineProperty(window, 'Worker', { value: undefined, configurable: true });

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const path = url.startsWith(ICON_BASE) ? url.slice(ICON_BASE.length) : null;
  if (path !== null) {
    const svg = icons[path];
    return Promise.resolve(
      svg ? new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } }) : new Response('', { status: 404 }),
    );
  }
  return nativeFetch(input, init);
};

window.KRDiagram = {
  async render(graph: DiagramGraph, title: string): Promise<string> {
    installTokens();
    const scene = buildScene(graph, undefined, {
      collapsed: autoCollapse(graph),
      expanded: new Set(),
      focus: null,
      ghosts: false,
    });
    const layout = await layoutScene(scene);
    const { svg } = await toSvg({
      title,
      subtitle: graph.description,
      scene,
      layout,
      overlay: null,
      showCost: false,
      security: false,
      notes: [],
    });
    return svg;
  },
};
