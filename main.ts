// Solmar City entrypoint: copies game/ and screenshots/ next to this file into
// the output directory and writes the make.fun dossier for the entry.
// Node 22, standard library only, no build step.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
for (const name of ['game', 'screenshots']) {
  const src = join(here, name);
  if (existsSync(src)) cpSync(src, join(out, name), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
}));
console.log('wrote', join(out, 'dossier.json'));
