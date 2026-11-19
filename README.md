# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar City** — an original sun-soaked coastal open-world crime game for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). You are Ray Vega, a
nobody fresh off the bus in Solmar City, where the fixer Mara has four jobs
with your name on them. Steal cars, outrun the Solmar PD, run the pizza rush,
and pull the job that makes you a legend. Every name, character, place,
vehicle, piece of art and sound in this game is original — nothing is taken
from any commercial game.

## The game

- **A city to explore** — a procedural 10×10-block coastal city: roads with
  lane markings, sidewalks, varied buildings with lit windows, palm trees,
  streetlights, parks, a beach strip, ocean and a wooden pier.
- **On foot and by car** — third-person on-foot movement with a mouse-orbit
  camera, plus arcade driving (accelerate, steer, handbrake) in any car you
  can steal. Traffic (~10 AI cars) loops the roads; parked cars wait to be
  jacked; ~24 pedestrians walk the sidewalks and flee from gunfire and
  near-misses.
- **Wanted 0–5 stars** — stealing a car, hitting a pedestrian or firing a
  shot raises the heat. Foot cops chase and punch from 1 star, police cars
  chase and ram from 2 stars. Stay quiet and out of sight and the heat
  decays. Get held by a cop and you're Busted; drop to zero health and
  you're Wasted — either way you respawn at the station or hospital minus
  some cash.
- **Missions and story** — four sequential jobs from Mara, with a
  phone-style objective panel, a 3D beacon, minimap markers and timers:
  1. **First Wheels** — steal any car, deliver it to Mara's garage.
  2. **Pizza Rush** — three delivery drops against the clock.
  3. **Lose the Heat** — reach 3 stars, then vanish and reach the safehouse.
  4. **The Solmar Job** — hit the bank, grab the cash on foot, escape at
     4 stars to the docks. Finish it and Solmar is yours — free roam.
- **Combat** — punch (F) and a pistol (click) with a hitscan tracer.
- **HUD** — live minimap (roads, player arrow, traffic, police blips,
  mission marker), wanted stars, health bar, cash, in-game clock, speed,
  objective panel, and a controls hint.
- **Sound** — fully synthesized WebAudio: engine hum by speed, a police
  siren at 2+ stars, gunshots, punches, crashes, pickup blips and mission
  jingles. No audio files. M mutes.
- **Save** — progress (cash, mission, position, health, wanted, stats)
  autosaves to localStorage; Continue on the title screen picks it up.
- **Deterministic** — a seeded RNG (mulberry32) builds the city, traffic
  and pedestrians, and the simulation runs on a fixed 1/60 s step.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — every file the game loads lives under
`game/`. Three.js is vendored as `game/vendor/three.min.js`.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move (on foot) |
| Shift | Run |
| Mouse drag / wheel | Orbit camera / zoom |
| E | Steal nearest car / exit car |
| F | Punch |
| Click | Shoot pistol |
| W / S | Drive / brake-reverse |
| A / D | Steer |
| Space | Handbrake |
| Esc / P | Pause |
| M | Mute |

## Layout

```
main.ts            entry program: copies game/ + screenshots/ to /output,
                   writes /output/dossier.json, verifies the handoff
serve.ts           static server for game/ on http://localhost:8080
game/
  index.html       page, HUD overlay, import map for three
  vendor/
    three.min.js   vendored Three.js (minified build)
  src/
    config.js      tuning constants
    random.js      seeded RNG + math helpers
    world.js       city generation, roads, collision queries
    player.js      on-foot movement, punch, pistol, car entry
    vehicles.js    driving physics, traffic AI, parked cars
    pedestrians.js sidewalk walkers, fleeing, being run over
    police.js      wanted level, foot cops, police cars
    missions.js    Mara's four jobs, objectives, rewards
    input.js       keyboard + mouse state
    audio.js       synthesized WebAudio sound
    hud.js         DOM HUD + 2D canvas minimap + screens
    render.js      Three.js scene, city meshes, entity sync, camera
    shots.js       deterministic ?shot= staging for screenshots
    main.js        boot, fixed-step loop, save/load, screens
shots.json         the four screenshot scenes
screenshots/      real renders of the game (see shots.json)
vendor/
  makefun-game.ts  the kit's dossier library, unchanged
```

## Screenshots

Staged deterministically with `?shot=start|drive|chase|mission&seed=1`
(see `game/src/shots.js`): the title vista, driving downtown, a 3-star
police chase with the patrol cars staged in frame ahead of the player, and
a mission in progress at Mara's garage.
