import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const serverTsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const api = spawn(process.execPath, ['--import', 'tsx', '--watch', 'apps/server/src/main.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TSX_TSCONFIG_PATH: serverTsconfig,
    WEB_ORIGIN: 'http://localhost:5173',
    PORT: '8787',
  },
});
const ui = spawn('npm', ['run', 'dev', '-w', '@smw/web', '--', '--strictPort', '--port', '5173'], {
  stdio: 'inherit',
});
const children = [api, ui];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
