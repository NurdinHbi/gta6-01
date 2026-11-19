# Solmar City — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A complete, original 3D open-world crime game for the make.fun **gta6-01**
bounty ("Make GTA 6"). It plays offline in a desktop browser from static files,
with no network requests: three.js r152 is vendored under `game/vendor/`.

## The game

You are new in **Solmar City** — a sun-soaked procedural coastal city of ~150
buildings on a 10×10 street grid, with a sand beach, a pier, palms and
streetlights. A fixer named **Mara** pays cash for drivers with nerve.

- **On foot:** WASD to move, Shift to run, Space to jump, F to punch, `2` +
  click to shoot the pistol, drag the mouse to look around.
- **Driving:** press E near any car to steal it (that is 1 star), W/S to drive,
  A/D to steer, Space for the handbrake, E to get out.
- **Traffic & pedestrians:** 10 AI traffic cars circulate the blocks, 12 parked
  cars wait to be stolen, 24 pedestrians stroll the sidewalks and flee gunfire.
- **Wanted 0–5 stars:** stealing, hitting pedestrians, shooting and killing cops
  raise the heat. Foot cops chase from 1 star, police cars from 2. Get caught
  and you are Busted; run out of health and you are Wasted — either way you wake
  up at the plaza 10% lighter. Stay clean and out of sight and the stars fade.
- **Story — four missions from Mara:** First Wheels ($300), Pizza Rush ($500),
  Lose the Heat ($800), The Solmar Job ($1,500). Each has a glowing beacon, a
  minimap marker, an objective panel and a timer. After the story, taxi fares
  pay $40–$120 a ride in free roam.
- **HUD:** live 2D minimap (player, cars, cops, objective), health, cash,
  wanted stars, clock, speed and objective panel.
- **Save:** progress (cash, story, health, position, clock) autosaves to
  localStorage; Continue picks up where you left off.
- **Sound:** fully synthesized WebAudio — engine drone, gunshots, sirens,
  pickups, mission jingles and an ambient pad. No audio files. M mutes.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to the output
directory and writes `dossier.json` with the kit's `vendor/makefun-game.ts`.

## Layout

- `game/index.html` — page, HUD and screens
- `game/src/main.js` — boot, loop, player, combat, driving, Busted/Wasted
- `game/src/city.js` — procedural city, beach, pier, collision
- `game/src/vehicles.js` — car meshes, arcade physics, traffic AI, police chase
- `game/src/people.js` — pedestrians and foot cops
- `game/src/missions.js` — Mara's four story missions and taxi fares
- `game/src/wanted.js` — wanted level, police dispatch, heat decay
- `game/src/hud.js` — HUD and live minimap
- `game/src/audio.js` — synthesized WebAudio sound
- `game/src/controls.js` — keyboard and mouse orbit camera
- `game/src/save.js` — localStorage save / Continue
- `game/src/shots.js` — staged screenshot scenes (`?shot=chase|drive|mission|foot`)
- `game/src/config.js`, `game/src/rng.js` — tuning and seeded randomness
- `game/vendor/three.min.js` — three.js r152 (MIT), vendored

## License

MIT. Everything in Solmar City — the city, characters, vehicles, names, story,
art, sound and music — is original. Nothing is taken from any commercial game.
