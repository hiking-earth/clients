import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:h5'], {
  cwd: path.join(root, 'app'), stdio: 'inherit', env: { ...process.env, VITE_DESKTOP: 'true' },
});
if (result.status !== 0) process.exit(result.status || 1);
const target = path.join(root, 'desktop', 'client-dist');
rmSync(target, { recursive: true, force: true }); mkdirSync(target, { recursive: true });
cpSync(path.join(root, 'app', 'dist', 'build', 'h5'), target, { recursive: true });
