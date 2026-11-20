# Solmar City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An entry for the make.fun bounty: https://make.fun/competitions/gta6-01

**Solmar City** is an original 3D open-world crime game that runs entirely offline in a
desktop browser from static files. You are a driver-for-hire in Solmar, a sun-soaked
procedural coastal city of about ten by ten blocks, roughly 150 buildings, a beach, a
pier, a marina, a casino strip, a stadium and a lighthouse. A fixer named Mara calls
with jobs; the police call with sirens. Everything — the city, the characters, the
story, the art and the sound — is original, built for this bounty with Three.js
(vendored under `game/vendor/`) and synthesized WebAudio. No Rockstar names, logos,
characters, maps or assets appear anywhere.

## How to run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no install, no
network request while playing: the game is plain static files under `game/`.

To hand the game in as a make.fun entry:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` into the
output directory and writes `out/dossier.json` with the vendored make.fun library.

## The game

Start on the title screen, press **Enter** (or click **New Game**) and wake up on
Marina Boulevard with $250 in your pocket. Mara's first job is already waiting on the
objective panel. Finish her eight jobs in order and the city is yours to roam free.

### The city

- A procedural coastal grid: avenues, side streets, crosswalks, traffic lights,
  streetlights that switch on at dusk, palms along the beachfront.
- Landmarks you can navigate by: the Solmar Tower downtown, the Grand Solmar casino,
  the First Solmar Bank, the stadium, the marina with its boats, the pier, and the
  lighthouse at the end of the beach.
- A full day/night cycle. Dawn is pink, noon is hard white sun, golden hour turns the
  whole waterfront amber, and at night the neon signs, headlights and streetlights
  take over. The clock in the HUD tracks it.
- About 150 buildings in a dozen styles and heights, rooftop water tanks, billboards,
  parked cars, benches, and a sea that actually moves.

### On foot and by car

- **On foot:** WASD to move, Shift to run, mouse drag (or arrow keys) to orbit the
  camera, Space to punch, F or left-click to shoot, E to get into a nearby car,
  1 / 2 / 3 to switch weapons.
- **Driving:** W/S to accelerate and brake/reverse, A/D to steer, Space for the
  handbrake, E to get out, C to change the camera. Cars have working headlights at
  night, damage smoke when they are wrecked, and a speedometer in the HUD.
- Any of the roughly twelve parked cars can be stolen — but stealing one in front of
  a cop, or at all while the law is watching, raises your wanted level. About ten
  traffic cars circulate the avenues and stop (badly) for red lights; about
  twenty-four pedestrians stroll the sidewalks, cross the streets and scatter when
  shots are fired.

### Wanted, police, busted and wasted

The wanted level runs 0–5 stars and rises when you steal a car, hit a pedestrian,
fire a weapon in public, or take down a cop. At one star, foot cops chase you on the
streets. At two stars, police cruisers join the chase. At four stars the police set
up roadblocks across the avenues and a helicopter circles overhead with a searchlight.
Lose them by breaking line of sight and staying quiet and the stars cool down; get
caught on foot and you are **Busted**, get your health to zero and you are **Wasted**.
Either way you wake up at the hospital or the precinct and lose 10% of your cash.

### Mara's eight jobs

1. **First Errand** — pick up a package on the pier before the timer runs out.
2. **Getaway Driver** — steal a car and lose a two-star tail on the way to the hideout.
3. **Bank Job** — hold the lobby of the First Solmar Bank, then escape the three-star
   response to the safe house.
4. **Boat Chase** — take a speedboat from the marina and run down a smuggler's boat
   off the coast.
5. **Night Run** — a cross-city delivery after dark, no headlights, no mistakes.
6. **Stunt Jump** — clear the broken pier ramp and land the jump for the cameras.
7. **Rooftop Heist** — grab the briefcase from the Solmar Tower roof while a
   helicopter hunts you at four stars.
8. **The Big Score** — hit the Grand Solmar vault and bring the money home through
   roadblocks at five stars.

Every job has a beacon in the world, a marker on the live minimap, a countdown timer
and a cash payout. Finish all eight and free roam unlocks with a bonus.

### Weapons and side activities

Three weapons: the **Pistol** (accurate, steady), the **SMG** (fast, close range) and
the **Shotgun** (wide spread, heavy punch), each with its own ammo, reload and sound.
Between jobs there are ten gold briefcases hidden around the city — on rooftops,
under the pier, behind the stadium — and three stunt ramps that pay out for a clean
landing. Collectibles and stunt cash are saved with your progress.

### HUD, sound and saving

The HUD shows a live 2D minimap (streets, beach, beacons, police, your car), wanted
stars, health, cash, the clock, your speed while driving, the current objective and
a message feed. All sound is synthesized WebAudio — engine hum, sirens, gunshots,
pickup chimes and Mara's job jingle — with no audio files at all. Progress (cash,
jobs completed, briefcases found, best stunt) is saved to `localStorage`; the title
screen offers **Continue** when a save exists.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive (W accelerate, S brake/reverse) |
| Shift | Run on foot |
| Mouse drag / ← → | Orbit camera (C toggles chase cam while driving) |
| Space | Punch on foot / handbrake while driving |
| F or left-click | Shoot |
| 1 / 2 / 3 | Pistol / SMG / Shotgun |
| R | Reload |
| E | Enter / exit car (or boat) |
| P or Esc | Pause |
| M | Mute |
| Enter | Start / confirm |

## Screenshots

`screenshots/` holds four real frames of the running game, staged deterministically
with `?shot=start|chase|night|end&seed=N` (see `game/src/shots.js`): the title
screen at golden hour, a three-star police chase, the casino strip at night, and the
final-job getaway at dusk. The game sets `window.__shotReady` once a staged frame
has painted.

## Files

- `game/index.html` — the page, HUD DOM and import map.
- `game/src/` — the game itself: `main.js` (boot and loop), `config.js` (tuning and
  the eight jobs), `world.js` (procedural city, vehicles, pedestrians, police,
  helicopter, boat, wanted system and combat), `missions.js` (job state machine),
  `hud.js` (HUD, minimap, menus), `audio.js` (synthesized sound), `input.js`,
  `random.js` (seeded RNG), `shots.js` (deterministic screenshot staging).
- `game/vendor/three.module.js` — Three.js r160, vendored, loaded offline.
- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` and writes
  `dossier.json`.
- `serve.ts` — a tiny static server for local play on port 8080.
- `vendor/makefun-game.ts` — make.fun's dossier library, copied unchanged from the kit.
- `shots.json` — the four screenshot scenes and their staging queries.

## License

MIT — see `LICENSE`. Solmar City is an original work made for the make.fun
gta6-01 bounty; it is not affiliated with Rockstar Games or Take-Two Interactive.
