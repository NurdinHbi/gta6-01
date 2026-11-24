[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/NurdinHbi/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An entry for the make.fun bounty: https://make.fun/competitions/gta6-01

# Solmar City

An original 3D open-world crime game set in a fictional coastal city. Runs
entirely offline in a desktop browser from static files — plain Three.js
(vendored, minified) plus synthesized WebAudio. No real-world names, logos,
characters, maps or assets anywhere.

## Play

Open `game/index.html` (or run `node serve.ts` and visit
http://localhost:8080). Press Enter on the title screen to start.

- **On foot:** WASD move, Shift run, drag the mouse (or arrow keys) to orbit
  the camera, Space punch, F or left-click shoot, E enter a nearby car,
  1/2/3 switch weapons, R reload, P/Esc pause, M mute.
- **Driving:** W/S accelerate and brake/reverse, A/D steer, Space handbrake,
  E exit. Headlights come on at night; a damaged car smokes, then catches
  fire — get it to the garage before it wrecks.
- **Wanted 0–5 stars:** stealing a car, hitting a pedestrian, firing a weapon
  in public or taking down a cop raises the heat. Foot cops chase at 1 star,
  cruisers join at 2, roadblocks appear across the avenues at 4 stars and a
  helicopter circles with a searchlight. Break line of sight and stay quiet
  to cool off. Caught on foot means Busted; zero health means Wasted. Either
  way you wake at the hospital minus 10% of your cash.

## Taxi side-jobs (new in round 7)

Yellow TAXI signs mark waiting passengers around the city. Drive any car up
to one, press **T**, and the meter starts: the fare ticks up with distance
and the timer counts down. Deliver the passenger to the yellow beacon before
time runs out — fast trips earn a $50 tip. Fares pay by distance, so a
cross-city run beats a short hop.

## Safehouse garage (new in round 7)

Drive into the blue pad at the safehouse (south-east corner, on the minimap)
and press **G**. Repair a battered car ($100), repaint it ($50), fit neon
underglow ($150) or a spoiler ($120). A car you customize becomes yours —
stealing it later raises no heat.

## Radio (new in round 7)

While driving, **Q** cycles the car radio: Solmar FM (mellow drive-time),
Neon Nights (synthwave) and Beach Radio (island bounce), all synthesized live
with WebAudio.

## Mara's nine jobs

Talk to Mara's beacon and work through the jobs in order — each has a world
beacon, a live minimap marker, a countdown timer and a cash payout:

1. **First Errand** — pick up a package on the pier before the timer runs out.
2. **Getaway Driver** — steal a car and lose a two-star tail on the way to
   the hideout.
3. **Bank Job** — hold the lobby of the First Solmar Bank, then escape the
   three-star response to the safe house.
4. **Boat Chase** — take a speedboat from the marina and run down a
   smuggler's boat off the coast.
5. **Night Run** — a cross-city delivery after dark.
6. **Stunt Jump** — clear the broken pier ramp and land the jump for the
   cameras.
7. **Rooftop Heist** — grab the briefcase from the Solmar Tower roof while a
   helicopter hunts you at four stars.
8. **The Big Score** — hit the Grand Solmar vault and bring the money home
   through roadblocks at five stars.
9. **Harbor Heist** *(new)* — grab the harbor shipment at the north docks,
   hold the warehouse while the crew loads up, and bring it home through the
   rain at four stars.

Finishing all nine unlocks free roam with a $5,000 bonus.

## Weapons

Pistol (accurate, steady), SMG (fast, close range) and Shotgun (wide spread,
heavy punch) — each with its own ammo, reload and synthesized sound.

## Side activities

10 gold briefcases hidden around the city ($250 each — rooftops, under the
pier, behind the stadium) and 3 stunt ramps paying $600 for a clean landing.
Progress (cash, jobs completed, briefcases found, best stunt, taxi fares,
garage upgrades) is saved to localStorage; the title screen offers Continue
when a save exists.

## The city

A procedural coastal grid of about 10x10 blocks with ~150 buildings in a
dozen styles and heights, rooftop water tanks, billboards, parked cars,
benches and a moving sea. Round 7 adds life: taxis, buses, vans and sports
cars in ten colours, traffic that stops at working traffic lights, beachgoers
on the sand, fishermen on the pier, street vendors with striped stalls, palm
trees along the beachfront, glowing neon signs, and rain showers that roll in
on their own — wet dark roads, grey skies, heavier fog. Landmarks to navigate
by: Solmar Tower downtown, the Grand Solmar casino, First Solmar Bank, the
stadium, a marina with boats, a pier and a lighthouse at the end of the
beach. A full day/night cycle runs from a pink dawn through a hard white noon
and a golden-hour waterfront to neon nights with headlights and streetlights;
the HUD clock tracks it.

## Deterministic scenes

`?seed=N` fixes the city and traffic. `?shot=start|chase|night|end` (with
`&seed=N`) stages that scene instead of running the loop, paints it a few
times and sets `window.__shotReady` for screenshots. The four shots show the
round-7 additions: the beachfront taxi at golden hour, a rainy taxi fare at
dusk, the neon casino strip at night, and the Harbor Heist getaway.

## Layout

- `game/index.html`, `game/style.css` — page and HUD styling
- `game/src/main.js` — boot and the fixed-step loop
- `game/src/config.js` — tuning numbers, jobs, weapons, taxi and garage prices
- `game/src/world.js` — procedural city, vehicles, pedestrians, police,
  helicopter, boat, weather, taxi stands and the garage
- `game/src/missions.js` — the nine-job state machine
- `game/src/hud.js` — HUD, 2D minimap, taxi meter and menus
- `game/src/audio.js` — synthesized WebAudio sound and the three radio stations
- `game/src/input.js` — keyboard and mouse input
- `game/src/random.js` — seeded RNG
- `game/src/shots.js` — deterministic screenshot staging
- `game/vendor/three.module.min.js` — Three.js 0.160.0, minified build
- `vendor/makefun-game.ts` — the make.fun dossier library (unchanged)
- `main.ts` — copies `game/` and `screenshots/` into `out/` and writes
  `out/dossier.json`
- `serve.ts` — tiny static server on port 8080
- `shots.json` — the four screenshot scenes and their staging queries

## Build

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node serve.ts   # http://localhost:8080
```

## License

MIT — see `LICENSE`.
