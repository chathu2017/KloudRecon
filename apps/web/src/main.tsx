import './styles/fonts.css';
import './styles/index.css';

import * as React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { createAppRouter } from './app/router';

const router = createAppRouter();

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

const app = (
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </React.StrictMode>
);

// Public marketing pages are prerendered at build time (scripts/prerender.mjs, decision 0043).
// On the page that was prerendered, React hydrates the existing markup (no repaint, no layout
// shift). Anywhere else (e.g. a local preview serving that HTML for an app route) the markup is
// dropped and the app renders from scratch. Intro animations already played on the static HTML.
const prerendered = root.dataset.prerendered;
const path = window.location.pathname.replace(/\/+$/, '') || '/';
if (prerendered) document.documentElement.classList.add('no-intro');
if (prerendered && prerendered === path) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  delete root.dataset.prerendered;
  createRoot(root).render(app);
}
