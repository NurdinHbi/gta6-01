// Solmar City — the entry point for make.fun gta6-01 (Node 22, standard library only).
// The game is plain static files under game/ (index.html plus its ES modules and the
// vendored three.js build), so handing it in is a copy: game/ and screenshots/ go to
// the output directory, and vendor/makefun-game.ts writes /output/dossier.json, the
// summary the judge reads. Run it outside the grader with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// then serve the copy with `node serve.ts` to play it at http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The sealed gate's caps (reference/gate.json): screenshots at most 4 and 256 KiB each,
// game/ at most 993 files and 48 MiB in all, every game path at most 1000 bytes, and
// the dossier text at most 160 KiB. The numbers below refuse an entry the scorer
// would refuse, so a local run that passes here is shaped like a valid submission.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Solmar City handed in to ${outputDir}`);
