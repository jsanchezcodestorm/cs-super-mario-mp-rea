// Offline extraction of player poses, sprite OAM and dynamic platform parts.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureCreatures } from './capture-creatures.mjs';
import { Cartridge } from '../../../tools/rom/cartridge.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const names = readdirSync(root).filter((name) => /\.(smc|sfc)$/i.test(name));
if (!process.argv[2] && names.length !== 1) throw Error('Indicare il percorso della ROM E1.');
const rom = new Cartridge(resolve(root, process.argv[2] ?? names[0]));
captureCreatures(root, rom);
