#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const palette = JSON.parse(readFileSync(path.join(root, 'shared/design/palette.json'), 'utf8'));
const keys = ['background', 'panel', 'surface', 'text', 'muted', 'accent', 'border'];
for (const key of keys) {
  if (typeof palette[key] !== 'string' || !/^#[\da-f]{6}$/i.test(palette[key])) {
    throw new Error(`Invalid shared palette value: ${key}`);
  }
}
const layoutKeys = ['homeTopbarHeight', 'homeTopbarRadius', 'homeBrandMarkSize', 'homePanelWidth',
  'homeMobileTopbarHeight', 'homeMobileTopbarRadius', 'homeMobileBrandMarkSize'];
for (const key of layoutKeys) {
  if (typeof palette[key] !== 'string' || !/^\d+(?:\.\d+)?px$/.test(palette[key])) {
    throw new Error(`Invalid shared layout value: ${key}`);
  }
}
const css = `/* Generated from shared/design/palette.json by scripts/sync-design-palette.mjs. */
:root {
${[
  ...keys.map(key => `  --he-color-${key}: ${palette[key]};`),
  ...layoutKeys.map(key => `  --he-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}: ${palette[key]};`),
].join('\n')}
}
`;
const scss = `// Generated from shared/design/palette.json by scripts/sync-design-palette.mjs.
${keys.map(key => `$he-color-${key}: ${palette[key]};`).join('\n')}
`;
writeFileSync(path.join(root, 'shared/design/palette.css'), css);
writeFileSync(path.join(root, 'shared/design/palette.scss'), scss);
const webAppDirectory = path.join(root, 'web/app');
if (existsSync(webAppDirectory)) writeFileSync(path.join(webAppDirectory, 'palette.css'), css);
const pagesPath = path.join(root, 'app/src/pages.json');
const pages = JSON.parse(readFileSync(pagesPath, 'utf8'));
pages.globalStyle = { ...pages.globalStyle, navigationBarBackgroundColor: palette.background, backgroundColor: palette.background };
pages.tabBar = { ...pages.tabBar, color: palette.muted, selectedColor: palette.accent, backgroundColor: palette.panel };
writeFileSync(pagesPath, `${JSON.stringify(pages, null, 2)}\n`);
process.stdout.write(`Generated client palette${existsSync(webAppDirectory) ? ' and web palette' : ''} from the shared palette.\n`);
