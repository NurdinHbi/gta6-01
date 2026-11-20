// Solmar City — make.fun gta6-01 entry packager (Node 22, standard library only).
//
// The playable game is the static files under game/ (index.html plus its ES
// modules and the vendored Three.js build). This script assembles the entry
// directory: it copies game/ and screenshots/ into the output directory and
// writes dossier.json there with the vendored make.fun dossier library, so
// the judge reads exactly what the scorer would produce from the same files.
//
// Run it as:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output; without it
// the default is /output.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });

// Start clean so a stale screenshot or game file can never leak into the entry.
for (const sub of ['game', 'screenshots']) {
  const target = join(out, sub);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
} else {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
}

// The caps mirror the competition gate: at most 4 screenshots of 256 KiB,
// at most 993 files / 48 MiB of game files, paths under 1000 bytes, and a
// 160 KiB dossier text budget. buildDossier throws if any cap is breached,
// which is exactly the failure the scorer would report.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`entry written to ${out}`);
