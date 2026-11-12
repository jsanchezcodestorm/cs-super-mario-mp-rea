import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
const names = readdirSync(root).filter((name) => /\.(smc|sfc)$/i.test(name));
if (!process.argv[2] && names.length !== 1) throw Error('Indicare il percorso della ROM E1.');
const rom = resolve(process.argv[2] ?? join(root, names[0]));
run(process.execPath, ['tools/rom/extract.mjs', rom]);
run(process.execPath, ['apps/web/tools/build-actors.mjs', rom]);
const dir = join(root, '.cache', 'snes9x');
let core = process.env.SNES9X_CORE;
if (!core) {
  const pin = 'fae2fea08f74180759ef540ee94259213f503480';
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, '.git'))) run('git', ['-C', dir, 'init', '--quiet']);
  if (!existsSync(join(dir, 'libretro', 'Makefile'))) {
    run('git', ['-C', dir, 'fetch', '--depth=1', 'https://github.com/libretro/snes9x.git', pin]);
    run('git', ['-C', dir, 'checkout', '--detach', 'FETCH_HEAD']);
  }
  const revision = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (revision !== pin) throw Error('Versione inattesa del core SNES di estrazione');
  run('make', ['-C', join(dir, 'libretro'), '-j' + Math.min(availableParallelism(), 8)]);
  core = join(dir, 'libretro', 'snes9x_libretro.' + (process.platform === 'darwin' ? 'dylib' : 'so'));
}
run('python3', ['tools/reference/capture.py', resolve(core), rom, join(root, 'generated')]);

const catalogPath = join(root, 'generated/content.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
for (const [field, name] of [['overworldNodes', 'nodes'], ['overworldPaths', 'paths']]) {
  catalog[field] = JSON.parse(readFileSync(join(root, 'generated/world', name + '.json'), 'utf8'));
}
const pending = join(root, 'generated/content.pending.json');
writeFileSync(pending, JSON.stringify(catalog));
renameSync(pending, catalogPath);

run('python3', ['tools/rom/scroll_capture.py', resolve(core), rom, join(root, 'generated')]);
run('python3', ['tools/rom/boss_capture.py', resolve(core), rom, join(root, 'generated')]);
run('python3', ['tools/rom/hud_capture.py', resolve(core), rom, join(root, 'generated')]);
