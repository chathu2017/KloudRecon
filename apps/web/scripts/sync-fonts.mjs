// Copies the self-hosted variable fonts (latin, woff2) from @fontsource-variable so index.html can
// preload them (no layout shift) and CSP font-src 'self' holds. Run after updating the packages:
// `npm run fonts:sync`. All families are under the SIL Open Font License 1.1.
//
// Web app (decision 0044): Manrope (display + text, weight axis), JetBrains Mono (IDs, code).
// PDF reports (decision 0042, unchanged): Bricolage Grotesque, Instrument Sans, JetBrains Mono,
// embedded by the backend from its own assets folder.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  {
    out: join(root, 'public', 'fonts'),
    files: [
      ['manrope', 'manrope-latin-wght-normal.woff2'],
      ['jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
    ],
  },
  {
    out: join(root, '..', '..', 'backend', 'src', 'kloudrecon', 'reports', 'assets', 'fonts'),
    files: [
      ['bricolage-grotesque', 'bricolage-grotesque-latin-opsz-normal.woff2'],
      ['instrument-sans', 'instrument-sans-latin-wght-normal.woff2'],
      ['jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
    ],
  },
];
for (const { out, files } of targets) {
  mkdirSync(out, { recursive: true });
  // drop fonts from earlier designs
  for (const old of readdirSync(out)) rmSync(join(out, old));
  for (const [pkg, file] of files) {
    copyFileSync(join(root, 'node_modules', '@fontsource-variable', pkg, 'files', file), join(out, file));
    // the SIL Open Font License travels with the files
    copyFileSync(join(root, 'node_modules', '@fontsource-variable', pkg, 'LICENSE'), join(out, `OFL-${pkg}.txt`));
  }
}
console.log('copied the web fonts to public/fonts and the PDF fonts to the report assets');
