import { spawn } from 'node:child_process';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script with npm run dev.');
const children = [
  ['backend', 'dev'],
  ['backend', 'worker:inventory'],
  ['frontend', 'dev'],
].map(([folder, task]) =>
  spawn(process.execPath, [npm, '--prefix', folder, 'run', task], { stdio: 'inherit' }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32')
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    else child.kill('SIGTERM');
  }
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
