#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
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
const css = `/* Generated from shared/design/palette.json by scripts/sync-design-palette.mjs. */
:root {
${keys.map(key => `  --he-color-${key}: ${palette[key]};`).join('\n')}
}
`;
writeFileSync(path.join(root, 'shared/design/palette.css'), css);
writeFileSync(path.join(root, 'web/app/palette.css'), css);
process.stdout.write('Generated app and web palette styles from the shared palette.\n');
