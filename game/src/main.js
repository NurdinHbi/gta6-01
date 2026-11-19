// Solmar City — boot, the one loop, and the player.
// The Game owns the scene and every system; the loop steps the world in fixed
// 1/60 s slices and paints what is there. Screens: title, play, paused, busted,
// wasted. ?shot=<scene>&seed=<n> stages a screenshot scene instead of the loop.

import { CAR, CITY, DAY_START_MINUTES, MISSIONS, PALETTE, PLAYER, STEP, WANTED } from './config.js';
import { Rng } from './rng.js';
import { SoundBank } from './audio.js';
import { buildCity, clampToWorld, resolveCircleCollision } from './city.js';
import { Car, makeLoop, stepCar, stepTraffic } from './vehicles.js';
import { FootCop, Pedestrian, makePersonMesh, randomStreetSpot } from './people.js';
import { MissionManager } from './missions.js';
import { WantedSystem } from './wanted.js';
import { Hud } from './hud.js';
import { clearSave, loadSave, saveGame } from './save.js';
import { Controls } from './controls.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.params = new URLSearchParams(window.location.search);
    const seedParam = Number.parseInt(this.params.get('seed') ?? '', 10);
    this.seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
    this.rng = new Rng(this.seed);
    this.sound = new SoundBank();
    this.controls = new Controls(canvas);
    this.mode = 'title';
    this.cash = 0;
    this.clockMinutes = DAY_START_MINUTES;
    this.time = 0;
    this.saveTimer = 0;
    this.crimeCooldown = 0;
    this.regenTimer = 0;
    this.effects = [];
    this.shotReady = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

    this.city = buildCity(this.scene, this.rng);
    this.missions = new MissionManager(this.scene);
    this.wanted = new WantedSystem(this.scene);
    this.hud = new Hud();

    // The player: a blue-shirted figure with a visible pistol when armed.
    this.player = {
      mesh: makePersonMesh(PALETTE.playerShirt),
      yaw: Math.PI,
      vel: { x: 0, z: 0 },
      health: PLAYER.health,
      armed: 'fists',
      punchTimer: 0,
      pistolTimer: 0,
      vy: 0,
      grounded: true,
      walkPhase: 0,
    };
    this.player.mesh.position.set(0, 0, 12);
    this.scene.add(this.player.mesh);
    this.pistolMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    this.pistolMesh.position.set(0.42, 1.0, 0.3);
    this.pistolMesh.visible = false;
    this.player.mesh.add(this.pistolMesh);
    this.playerCar = null;

    // Traffic, parked cars and pedestrians fill the streets.
    this.cars = [];
    this.peds = [];
    for (let i = 0; i < 10; i += 1) {
      const spot = randomStreetSpot(this.rng);
      const car = new Car(this.scene, spot.x, spot.z, this.rng.float(0, Math.PI * 2), this.rng.pick(PALETTE.carPaint), 'traffic');
      car.route = makeLoop(this.rng);
      car.driver = 'ai';
      this.cars.push(car);
    }
    for (let i = 0; i < 12; i += 1) {
      const spot = randomStreetSpot(this.rng);
      const kind = i === 0 ? 'taxi' : 'sedan';
      const color = kind === 'taxi' ? PALETTE.taxi : this.rng.pick(PALETTE.carPaint);
      const car = new Car(this.scene, spot.x, spot.z, this.rng.float(0, Math.PI * 2), color, 'parked');
      car.driver = null;
      this.cars.push(car);
    }
    for (let i = 0; i < 24; i += 1) {
      const spot = randomStreetSpot(this.rng);
      this.peds.push(new Pedestrian(this.scene, spot.x, spot.z, this.rng));
    }

    // A tracer line for pistol shots, reused every shot.
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.scene.add(this.tracer);
    this.tracerTimer = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindScreens();
    this.missions.setStartBeacon(true);
    this.hud.setObjective('Welcome to Solmar City. Head to the green beacon at Mara\'s garage to start work.');
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  playerPos() {
    return this.playerCar ? this.playerCar.pos : this.player.mesh.position;
  }

  playerYaw() {
    return this.playerCar ? this.playerCar.yaw : this.player.yaw;
  }

  say(text, seconds = 4) { this.hud.say(text, seconds); }

  setWanted(level, silent = false) {
    this.wanted.set(level, silent);
    if (level >= 2) this.sound.sirenStart();
    else if (level === 0) this.sound.sirenStop();
  }

  addCrime(amount) {
    if (this.crimeCooldown > 0) return;
    this.crimeCooldown = 2;
    this.wanted.add(amount, this);
  }

  save() { saveGame(this); }

  // ---- screens ------------------------------------------------------------

  bindScreens() {
    const $ = (id) => document.getElementById(id);
    $('start-btn').addEventListener('click', () => {
      this.sound.ensure();
      this.startNewGame();
    });
    $('continue-btn').addEventListener('click', () => {
      this.sound.ensure();
      this.continueGame();
    });
    $('resume-btn').addEventListener('click', () => this.setMode('play'));
    $('respawn-btn').addEventListener('click', () => this.respawn());
    $('restart-btn').addEventListener('click', () => {
      clearSave();
      window.location.href = window.location.pathname;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'play') this.setMode('paused');
    });
  }

  setMode(mode) {
    this.mode = mode;
    const show = (id, on) => { document.getElementById(id).style.display = on ? 'flex' : 'none'; };
    show('title-screen', mode === 'title');
    show('pause-screen', mode === 'paused');
    show('end-screen', mode === 'busted' || mode === 'wasted');
    document.getElementById('hud').style.display = mode === 'play' ? 'block' : 'none';
    if (mode === 'play') this.missions.setStartBeacon(true);
  }

  startNewGame() {
    clearSave();
    this.cash = 0;
    this.clockMinutes = DAY_START_MINUTES;
    this.player.health = PLAYER.health;
    this.player.mesh.position.set(0, 0, 12);
    this.player.yaw = Math.PI;
    this.missions.index = 0;
    this.missions.active = null;
    this.missions.fare = null;
    this.setWanted(0);
    this.setMode('play');
    this.say('Mara is waiting at the green beacon. Go introduce yourself.', 6);
  }

  continueGame() {
    const data = loadSave();
    if (!data) { this.startNewGame(); return; }
    this.cash = data.cash;
    this.clockMinutes = data.clockMinutes;
    this.player.health = data.health;
    this.player.mesh.position.set(data.x, 0, data.z);
    this.player.yaw = data.yaw;
    this.missions.index = Math.min(data.missionIndex, MISSIONS.length);
    this.setWanted(0);
    this.setMode('play');
    this.say(`Welcome back. Cash $${this.cash}. ${this.missions.storyDone ? 'Story complete — free roam.' : `Next job: ${MISSIONS[this.missions.index].name}.`}`, 6);
  }

  respawn() {
    const lost = Math.floor(this.cash * 0.10);
    this.cash -= lost;
    this.player.health = PLAYER.health;
    this.player.mesh.position.set(0, 0, 12);
    this.player.yaw = Math.PI;
    if (this.playerCar) {
      this.playerCar.driver = null;
      this.playerCar = null;
      this.player.mesh.visible = true;
    }
    this.wanted.clearPursuit(this);
    this.setWanted(0);
    this.missions.active = null;
    this.missions.hideBeacon();
    this.missions.hideBeacon2();
    this.setMode('play');
    this.say(`You wake up at the plaza, $${lost} lighter. Mara is still waiting.`, 5);
    this.save();
  }

  busted() {
    if (this.mode !== 'play') return;
    this.sound.busted();
    this.setMode('busted');
    document.getElementById('end-title').textContent = 'BUSTED';
    document.getElementById('end-text').textContent = 'The Solmar PD caught up with you. You lose 10% of your cash and walk free.';
  }

  wasted() {
    if (this.mode !== 'play') return;
    this.sound.missionFail();
    this.setMode('wasted');
    document.getElementById('end-title').textContent = 'WASTED';
    document.getElementById('end-text').textContent = 'You got in over your head. You lose 10% of your cash and wake up at the plaza.';
  }

  damagePlayer(amount, cause) {
    if (this.mode !== 'play') return;
    this.player.health -= amount;
    this.regenTimer = 0;
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.wasted();
    }
  }

  damageCar(car, amount) {
    if (car.dead) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.dead = true;
      this.explode(car.pos.x, 1, car.pos.z);
      this.scene.remove(car.mesh);
      const i = this.cars.indexOf(car);
      if (i >= 0) this.cars.splice(i, 1);
      if (car === this.playerCar) {
        this.playerCar = null;
        this.player.mesh.visible = true;
        this.player.mesh.position.set(car.pos.x + 2, 0, car.pos.z + 2);
        this.damagePlayer(30, 'car explosion');
        this.say('Your car blew up! Get clear of the wreck.', 4);
      }
    }
  }

  explode(x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.9 }),
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.effects.push({ mesh, t: 0, kind: 'boom' });
    this.sound.noiseBurst(0.5, 400, 0.6);
  }

  // ---- player on foot ------------------------------------------------------

  stepPlayer(dt) {
    const p = this.player;
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.pistolTimer = Math.max(0, p.pistolTimer - dt);
    const move = this.controls.moveVector();
    const speed = this.controls.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Camera-relative movement: W walks away from the camera.
    const cy = this.controls.camYaw;
    const fx = Math.sin(cy);
    const fz = Math.cos(cy);
    const rx = Math.cos(cy);
    const rz = -Math.sin(cy);
    const mx = fx * move.z + rx * move.x;
    const mz = fz * move.z + rz * move.x;
    const targetVx = mx * speed;
    const targetVz = mz * speed;
    p.vel.x += Math.max(-PLAYER.accel * dt, Math.min(PLAYER.accel * dt, targetVx - p.vel.x));
    p.vel.z += Math.max(-PLAYER.accel * dt, Math.min(PLAYER.accel * dt, targetVz - p.vel.z));
    const pos = p.mesh.position;
    pos.x += p.vel.x * dt;
    pos.z += p.vel.z * dt;
    // A little hop.
    if (this.controls.takePress('Space') && p.grounded) {
      p.vy = PLAYER.jumpSpeed;
      p.grounded = false;
    }
    if (!p.grounded) {
      p.vy -= 22 * dt;
      pos.y += p.vy * dt;
      if (pos.y <= 0) { pos.y = 0; p.vy = 0; p.grounded = true; }
    }
    resolveCircleCollision(pos, PLAYER.radius, this.city.colliders);
    clampToWorld(pos, 4);
    const moving = Math.hypot(p.vel.x, p.vel.z) > 0.6;
    if (moving) {
      p.yaw = Math.atan2(p.vel.x, p.vel.z);
      p.walkPhase += dt * Math.hypot(p.vel.x, p.vel.z) * 1.6;
    }
    p.mesh.rotation.y = p.yaw;
    const s = moving ? Math.sin(p.walkPhase) * 0.6 : 0;
    const u = p.mesh.userData;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8;
    u.armR.rotation.x = s * 0.8;

    // Weapon switching and attacks.
    if (this.controls.takePress('Digit1')) { p.armed = 'fists'; this.pistolMesh.visible = false; }
    if (this.controls.takePress('Digit2')) { p.armed = 'pistol'; this.pistolMesh.visible = true; }
    if (this.controls.takePress('KeyF')) this.punch();
    if (this.controls.takeClick() && p.armed === 'pistol') this.shoot();
    if (this.controls.takePress('KeyE')) this.tryEnterCar();
    if (this.controls.takePress('KeyM')) {
      this.sound.setMuted(!this.sound.muted);
      this.say(this.sound.muted ? 'Sound muted (M to unmute).' : 'Sound on.', 2);
    }
  }

  nearestCar(maxDist) {
    const pos = this.player.mesh.position;
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.dead || car.driver === 'player') continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  tryEnterCar() {
    const car = this.nearestCar(4.5);
    if (!car) return;
    const wasParked = car.kind === 'parked' || car.driver === null;
    car.driver = 'player';
    car.kind = 'player';
    this.playerCar = car;
    this.player.mesh.visible = false;
    this.sound.pickup();
    if (wasParked) {
      this.addCrime(1);
      this.say('You stole the car. That is 1 star — drive like you mean it.', 4);
    } else {
      this.addCrime(1);
      this.say('You jacked a moving car! The driver ran off screaming.', 4);
    }
  }

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    car.speed = 0;
    car.driver = null;
    car.kind = 'parked';
    this.playerCar = null;
    const f = car.forward();
    this.player.mesh.position.set(car.pos.x - f.x * 2.6, 0, car.pos.z - f.z * 2.6);
    this.player.mesh.visible = true;
    this.player.yaw = car.yaw;
  }

  punch() {
    const p = this.player;
    if (p.punchTimer > 0) return;
    p.punchTimer = PLAYER.punchCooldown;
    this.sound.punch();
    const u = p.mesh.userData;
    u.armR.rotation.x = -1.4;
    const pos = p.mesh.position;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const targets = [...this.peds, ...this.wanted.cops];
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.pos.x - pos.x;
      const dz = t.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.punchRange && (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.2) {
        t.health -= PLAYER.punchDamage;
        this.sound.hit();
        t.scare?.();
        if (t.health <= 0) this.killPerson(t);
        else if (t instanceof Pedestrian) this.addCrime(1);
        break;
      }
    }
  }

  killPerson(t) {
    t.dead = true;
    t.mesh.rotation.z = Math.PI / 2;
    t.mesh.position.y = 0.3;
    if (t instanceof FootCop) {
      this.addCrime(2);
      this.say('You took down a cop. That is 2 stars — run!', 4);
    } else {
      this.addCrime(1);
      this.say('A pedestrian is down. The city saw that.', 4);
    }
  }

  shoot() {
    const p = this.player;
    if (p.pistolTimer > 0) return;
    p.pistolTimer = PLAYER.pistolCooldown;
    this.sound.gunshot();
    this.addCrime(1);
    const eye = new THREE.Vector3().copy(p.mesh.position);
    eye.y = 1.5;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best = null;
    let bestD = PLAYER.pistolRange;
    let bestPoint = null;
    const consider = (obj, radius) => {
      const to = new THREE.Vector3(obj.pos.x - eye.x, 1.1 - eye.y, obj.pos.z - eye.z);
      const d = to.length();
      if (d > PLAYER.pistolRange) return;
      const dot = to.normalize().dot(dir);
      if (dot < 0.94) return;
      if (d < bestD) { bestD = d; best = obj; bestPoint = new THREE.Vector3(obj.pos.x, 1.1, obj.pos.z); }
    };
    for (const ped of this.peds) if (!ped.dead) consider(ped, 0.5);
    for (const cop of this.wanted.cops) if (!cop.dead) consider(cop, 0.5);
    for (const car of this.cars) {
      if (car.dead || car === this.playerCar) continue;
      const to = new THREE.Vector3(car.pos.x - eye.x, 0.8 - eye.y, car.pos.z - eye.z);
      const d = to.length();
      if (d > PLAYER.pistolRange) continue;
      if (to.normalize().dot(dir) < 0.9) continue;
      if (d < bestD) { bestD = d; best = car; bestPoint = new THREE.Vector3(car.pos.x, 0.8, car.pos.z); }
    }
    const end = bestPoint ?? eye.clone().add(dir.clone().multiplyScalar(PLAYER.pistolRange));
    const attr = this.tracer.geometry.getAttribute('position');
    attr.setXYZ(0, eye.x, eye.y, eye.z);
    attr.setXYZ(1, end.x, end.y, end.z);
    attr.needsUpdate = true;
    this.tracer.material.opacity = 0.9;
    this.tracerTimer = 0.07;
    if (best) {
      if (best instanceof Car) {
        this.damageCar(best, PLAYER.pistolDamage);
        if (!best.dead) this.say('You shot a car. The owner will not be pleased.', 3);
      } else {
        best.health -= PLAYER.pistolDamage;
        this.sound.hit();
        best.scare?.();
        if (best.health <= 0) this.killPerson(best);
      }
    }
    // Nearby pedestrians flee the gunfire.
    for (const ped of this.peds) {
      if (!ped.dead && Math.hypot(ped.pos.x - eye.x, ped.pos.z - eye.z) < 18) ped.scare();
    }
  }

  // ---- driving -------------------------------------------------------------

  stepDriving(dt) {
    const car = this.playerCar;
    const c = this.controls;
    let throttle = 0;
    if (c.down('KeyW') || c.down('ArrowUp')) throttle = 1;
    if (c.down('KeyS') || c.down('ArrowDown')) throttle = -1;
    let steer = 0;
    if (c.down('KeyA') || c.down('ArrowLeft')) steer = -1;
    if (c.down('KeyD') || c.down('ArrowRight')) steer = 1;
    // Steering flips when reversing, like a real car.
    if (car.speed < -0.5) steer = -steer;
    if (c.down('Space')) {
      car.speed *= Math.max(0, 1 - 4.5 * dt);
      throttle = 0;
    }
    stepCar(car, throttle, steer, dt, this.city.colliders);
    // Ease the camera behind the car while driving.
    let dyaw = car.yaw - c.camYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    c.camYaw += dyaw * Math.min(1, 0.55 * dt);
    if (c.takePress('KeyE')) this.exitCar();
    if (c.takePress('KeyM')) {
      this.sound.setMuted(!this.sound.muted);
      this.say(this.sound.muted ? 'Sound muted (M to unmute).' : 'Sound on.', 2);
    }
    // Running over a pedestrian at speed is a crime, and it hurts.
    const pos = car.pos;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z) < 2.2 && Math.abs(car.speed) > 4) {
        this.killPerson(ped);
        car.speed *= 0.6;
      }
    }
    this.sound.setEngine(Math.abs(car.speed) / CAR.topSpeed, true);
  }

  // ---- the loop --------------------------------------------------------------

  step(dt) {
    this.time += dt;
    this.clockMinutes += dt; // one game minute per real second
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.regenTimer += dt;
    if (this.regenTimer > 10 && this.player.health < PLAYER.health && this.player.health > 0) {
      this.player.health = Math.min(PLAYER.health, this.player.health + 4 * dt);
    }
    if (this.playerCar) this.stepDriving(dt);
    else this.stepPlayer(dt);
    if (!this.playerCar) this.sound.setEngine(0, false);

    // Traffic and pedestrians keep the city alive.
    for (const car of this.cars) {
      if (car.driver === 'ai' && car.kind === 'traffic') stepTraffic(car, dt, this.city.colliders, this.cars);
    }
    for (const ped of this.peds) ped.update(dt, this.city.colliders, this.playerPos(), this.rng);
    this.wanted.update(dt, this);
    this.missions.update(dt, this);

    // Mission start: walk into the green beacon at Mara's garage.
    if (!this.missions.active && !this.missions.storyDone) {
      const s = this.missions.startSpot();
      const pp = this.playerPos();
      if (Math.hypot(pp.x - s.x, pp.z - s.z) < 6) {
        this.missions.begin(this.missions.index, this);
        this.missions.setStartBeacon(false);
      }
    }
    this.missions.setStartBeacon(!this.missions.active && !this.missions.storyDone && this.mode === 'play');

    // Effects (explosions) and the pistol tracer fade out.
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const fx = this.effects[i];
      fx.t += dt;
      const k = fx.t / 0.6;
      fx.mesh.scale.setScalar(1 + k * 7);
      fx.mesh.material.opacity = Math.max(0, 0.9 - k);
      if (k >= 1) { this.scene.remove(fx.mesh); this.effects.splice(i, 1); }
    }
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.material.opacity = 0;
    }

    // Autosave while playing.
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }

    this.controls.endFrame();
  }

  updateCamera(dt) {
    const c = this.controls;
    const target = this.playerPos();
    const dist = this.playerCar ? 11.5 : 8.5;
    const height = this.playerCar ? 4.3 : 3.6;
    const camX = target.x - Math.sin(c.camYaw) * dist * Math.cos(c.camPitch);
    const camZ = target.z - Math.cos(c.camYaw) * dist * Math.cos(c.camPitch);
    const camY = target.y + height + Math.sin(c.camPitch) * dist * 0.6;
    this.camera.position.set(camX, Math.max(1.6, camY), camZ);
    this.camera.lookAt(target.x, target.y + 2.1, target.z);
  }

  // Slow cinematic orbit for the title screen.
  updateTitleCamera(dt) {
    this.time += dt;
    const a = this.time * 0.045;
    const r = 210;
    this.camera.position.set(Math.sin(a) * r, 95, Math.cos(a) * r);
    this.camera.lookAt(0, 8, 40);
    for (const car of this.cars) {
      if (car.driver === 'ai' && car.kind === 'traffic') stepTraffic(car, dt, this.city.colliders, this.cars);
    }
    for (const ped of this.peds) ped.update(dt, this.city.colliders, this.playerPos(), this.rng);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.lastNow) this.lastNow = now;
    let frameDt = Math.min((now - this.lastNow) / 1000, MAX_FRAME);
    this.lastNow = now;
    if (this.controls.takePress('Escape') || this.controls.takePress('KeyP')) {
      if (this.mode === 'play') this.setMode('paused');
      else if (this.mode === 'paused') this.setMode('play');
    }
    if (this.mode === 'play') {
      let acc = frameDt;
      let guard = 0;
      while (acc >= STEP && guard < 8) { this.step(STEP); acc -= STEP; guard += 1; }
      this.updateCamera(frameDt);
      this.hud.update(frameDt, this);
    } else if (this.mode === 'title') {
      this.updateTitleCamera(frameDt);
      this.controls.endFrame();
    }
    this.renderer.render(this.scene, this.camera);
  }

  runShot(name) {
    stageShot(name, this);
    let painted = 0;
    const paint = () => {
      this.updateCamera(0.016);
      this.hud.update(0.016, this);
      this.renderer.render(this.scene, this.camera);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
  }

  run() {
    const shot = this.params.get('shot');
    if (shot) {
      document.getElementById('title-screen').style.display = 'none';
      document.getElementById('hud').style.display = 'block';
      this.runShot(shot);
    } else {
      const save = loadSave();
      document.getElementById('continue-btn').style.display = save ? 'block' : 'none';
      this.setMode('title');
      requestAnimationFrame((t) => this.frame(t));
    }
  }
}

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__solmar = game;
game.run();
