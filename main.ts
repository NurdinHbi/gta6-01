// Solmar City's entry program (Node 22, standard library only): the game
// is this directory's game/ folder — plain static files a desktop browser
// loads offline — and this program hands it in. It copies game/ and
// screenshots/ beside this file to /output and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (from the gate): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files in all, or a path under game/ over 1000 bytes.
const dossier = buildDossier(out, DOSSIER_CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

// Verify what was handed in, before the grader ever sees it:
// 1. The dossier on disk is byte for byte what buildDossier writes again
//    from the same files, so the run is deterministic.
// 2. Every screenshot is a whole JPEG or PNG (magic bytes) within the cap.
// 3. game/index.html exists and is within its 1 MiB cap.
const written = readFileSync(join(out, 'dossier.json'));
if (!written.equals(Buffer.from(dossier))) {
  throw new Error('dossier.json is not byte-identical to a fresh buildDossier run');
}
const shots = readdirSync(join(out, 'screenshots'))
  .filter((name) => !name.startsWith('.'))
  .sort();
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`screenshots/ holds ${shots.length} images, need 3 or 4`);
}
for (const name of shots) {
  const file = join(out, 'screenshots', name);
  const bytes = readFileSync(file);
  if (bytes.length > 262144) {
    throw new Error(`screenshot ${name} is ${bytes.length} bytes, over the 256 KiB cap`);
  }
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (!isJpeg && !isPng) {
    throw new Error(`screenshot ${name} is neither a JPEG nor a PNG (bad magic bytes)`);
  }
}
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing');
}
const indexSize = statSync(join(out, 'game', 'index.html')).size;
if (indexSize > 1048576) {
  throw new Error(`game/index.html is ${indexSize} bytes, over the 1 MiB cap`);
}
if (written.length > 1572864) {
  throw new Error(`dossier.json is ${written.length} bytes, over the 1.5 MiB cap`);
}
console.log(`dossier written: ${shots.length} screenshots, game/index.html ${indexSize} bytes, dossier ${written.length} bytes`);
