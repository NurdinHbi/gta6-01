# Solmar City

An original 3D open-world crime game for the make.fun **gta6-01** bounty — "Make GTA 6".
A sun-soaked procedural coastal city you can explore on foot and by car, steal cars in,
outrun the police through, and take story jobs in. Everything is original: the city,
the characters, the story, the art and the sound. No Rockstar Games names, logos,
characters, maps or assets.

## Play

Serve `game/` and open it in a desktop browser:

```sh
node serve.ts
# → http://localhost:8080
```

No build step, no network requests at runtime — the game is static files, and
three.js r170 is vendored under `game/vendor/three.min.js`.

## Controls

| Input | Action |
| --- | --- |
| WASD | Walk / drive (W accelerate, S brake/reverse) |
| Shift | Run |
| Mouse drag | Orbit the camera, wheel zooms |
| E | Enter / steal a car, get out, talk to Mara |
| F | Punch |
| Click | Fire the pistol |
| Space | Handbrake while driving |
| P | Pause, H help, M mute |

## The city

A 10×10-block procedural grid (~150 buildings with canvas-textured facades), ringed
by streets with traffic, sidewalks full of pedestrians, palms, streetlights, a sand
beach and a wooden pier over the sea. The layout is seeded — `?seed=N` replays the
same city — and the game runs on a fixed 1/60 s simulation.

## Systems

- **On foot and by car** — third-person orbit camera on foot, chase camera in the car,
  arcade handling with steering, handbrake and building/traffic collisions.
- **Stealing** — 12 parked cars plus the traffic itself. Taking one puts heat on you.
- **Wanted 0–5 stars** — rises when you steal, hit a pedestrian, shoot, or drop a cop.
  Foot cops chase from 1 star, patrol cars with flashing light bars join from 2. Lay low
  and the heat cools off.
- **Busted / Wasted** — arrested by a cop holding you, or flatlined, and you wake up at
  the police station or the hospital minus 10% of your cash.
- **Missions** — four sequential jobs for the fixer Mara, each with a gold beacon, a
  minimap marker and a timer: First Wheels ($300), Pizza Rush ($500), Lose the Heat
  ($800), The Solmar Job ($1,500). Finish all four and the city is yours in free roam.
- **HUD** — live 2D minimap (player, traffic, police, peds, mission marker), wanted
  stars, health, cash, in-game clock, speedometer and objective panel.
- **Save** — progress autosaves to localStorage; Continue from the title screen.
- **Sound** — fully synthesized WebAudio: engine hum, two-tone sirens, gunshots,
  punches, crashes, jingles and a quiet bassline. No audio files.

## Shots

`shots.json` stages four scenes for screenshots (`?shot=start|play|end&seed=N` sets
`window.__shotReady` once painted): the title over the city, a drive with a job
beacon, a three-star police chase, and a second drive at another seed.

## Layout

```
main.ts            entry point: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts           static server for local play
game/
  index.html       page, HUD DOM, import map for three
  vendor/
    three.min.js   three.js r170 (vendored)
  src/
    boot.js        entry, main loop, screens, combat, wanted, camera
    city.js        procedural city, beach, pier, colliders, minimap data
    rng.js         seeded random
    state.js       game state + localStorage save
    controls.js    keyboard / mouse input
    sound.js       synthesized WebAudio
    people.js      pedestrians + foot cops
    traffic.js     AI traffic, parked cars, police patrols, car builder
    driving.js     player car physics, enter/exit, muzzle tracer
    story.js       Mara's four missions + gold beacon
    overlay.js     HUD, minimap, screens
    staging.js     ?shot= scenes
screenshots/      4 real in-browser captures of the game
```

## License

MIT — see `LICENSE`.
