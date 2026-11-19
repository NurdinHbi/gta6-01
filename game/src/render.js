// Rendering: the Three.js scene — sky, sun, fog, the city meshes built
// from world data, and one synced mesh per live entity (player, cars,
// peds, cops, beacon, cash). Geometries and materials are shared so the
// draw call count stays low; the camera is a smooth third-person orbit.
import * as THREE from 'three';
import { CITY_HALF, OCEAN_X, BEACH_X, COLORS, ROADS, ROAD, GRID } from './config.js';
import { lerp, angleDiff, clamp } from './random.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 320, 950);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 60, 120);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.2);
  sun.position.set(220, 320, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -380;
  sun.shadow.camera.right = 380;
  sun.shadow.camera.top = 380;
  sun.shadow.camera.bottom = -380;
  sun.shadow.camera.far = 1000;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, sun };
}

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildCityMeshes(render, city) {
  const { scene } = render;
  const shared = {};
  // Ground: grass base, city slab, beach sand, ocean.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshLambertMaterial({ color: 0x6fae5f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.15;
  ground.receiveShadow = true;
  scene.add(ground);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_HALF * 2 + 8, 0.3, CITY_HALF * 2 + 8),
    new THREE.MeshLambertMaterial({ color: COLORS.sidewalk }),
  );
  slab.position.y = 0;
  slab.receiveShadow = true;
  scene.add(slab);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(OCEAN_X - CITY_HALF + 8, CITY_HALF * 2 + 200),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((CITY_HALF + OCEAN_X) / 2, 0.02, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 1600),
    new THREE.MeshLambertMaterial({ color: COLORS.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 350, 0.0, 0);
  scene.add(ocean);
  shared.ocean = ocean;

  // Roads: dark strips on the slab, one per grid line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
  const roadGeoH = new THREE.BoxGeometry(CITY_HALF * 2 + 8, 0.1, ROAD);
  const roadGeoV = new THREE.BoxGeometry(ROAD, 0.1, CITY_HALF * 2 + 8);
  for (const c of ROADS) {
    const h = new THREE.Mesh(roadGeoH, roadMat);
    h.position.set(0, 0.12, c);
    h.receiveShadow = true;
    scene.add(h);
    const v = new THREE.Mesh(roadGeoV, roadMat);
    v.position.set(c, 0.12, 0);
    v.receiveShadow = true;
    scene.add(v);
  }

  // Lane dashes, instanced: one draw call for the whole city.
  const dashGeo = new THREE.BoxGeometry(3, 0.05, 0.35);
  const dashMat = new THREE.MeshBasicMaterial({ color: COLORS.roadLine });
  const dashPositions = [];
  for (const c of ROADS) {
    for (let p = -CITY_HALF + 14; p < CITY_HALF - 10; p += 14) {
      dashPositions.push([p, c, 0]);
      dashPositions.push([c, p, 1]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  dashPositions.forEach(([x, z, rot], i) => {
    e.set(0, rot ? Math.PI / 2 : 0, 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, 0.2, z), q, new THREE.Vector3(1, 1, 1));
    dashes.setMatrixAt(i, m4);
  });
  scene.add(dashes);

  // Buildings: one shared unit box, three window materials.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const mats = city.windowCanvases.map((cv) => new THREE.MeshLambertMaterial({ map: canvasTexture(cv) }));
  const tinted = new Map();
  function buildingMaterial(color, tex) {
    const key = `${color}-${tex}`;
    if (!tinted.has(key)) {
      const base = mats[tex].clone();
      base.color = new THREE.Color(color);
      tinted.set(key, base);
    }
    return tinted.get(key);
  }
  for (const b of city.buildings) {
    const mesh = new THREE.Mesh(boxGeo, buildingMaterial(b.color, b.tex));
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, 0.15, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Flat roof cap so the top is not windows.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.4, 0.4, b.d + 0.4),
      new THREE.MeshLambertMaterial({ color: 0x6b6f78 }),
    );
    roof.position.set(b.x, b.h + 0.15, b.z);
    scene.add(roof);
  }

  // Palm trees: instanced trunks and crowns.
  const palmCount = city.palms.length;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount);
  const crownGeo = new THREE.ConeGeometry(2.2, 3.2, 7);
  crownGeo.translate(0, 1.6, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmCount);
  city.palms.forEach((palm, i) => {
    m4.compose(new THREE.Vector3(palm.x, 0.15, palm.z), q.identity(), new THREE.Vector3(1, palm.h, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(palm.x, palm.h * 0.9, palm.z), q.identity(), new THREE.Vector3(1, 1, 1));
    crowns.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(crowns);

  // Streetlights: instanced poles with a glowing head.
  const lightCount = city.lights.length;
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  poleGeo.translate(0, 3.5, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, lightCount));
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, Math.max(1, lightCount));
  city.lights.forEach((lamp, i) => {
    m4.compose(new THREE.Vector3(lamp.x, 0.15, lamp.z), q.identity(), new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(lamp.x, 7.1, lamp.z), q.identity(), new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // Docks: wooden pier out into the ocean at the east edge.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.8, 14),
    new THREE.MeshLambertMaterial({ color: 0x7a5c38 }),
  );
  pier.position.set(OCEAN_X + 18, 0.6, 0);
  pier.castShadow = true;
  scene.add(pier);
  for (let i = 0; i < 4; i += 1) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 3),
      new THREE.MeshLambertMaterial({ color: [0xb08954, 0x8a6f4d, 0xa87c4f, 0x96703f][i] }),
    );
    crate.position.set(OCEAN_X + 6 + i * 8, 2.2, -4 + (i % 2) * 8);
    crate.castShadow = true;
    scene.add(crate);
  }

  return shared;
}

// --- Entity meshes -------------------------------------------------------

function makePersonMesh(shirt, skin) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 1.0, 8),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: 0x2c3242 }),
  );
  legs.position.y = 0.2;
  group.add(legs);
  return group;
}

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.75, 2.0), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.65, 1.8),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(-0.2, 1.2, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const wz of [0.7, -0.7]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.35), lightMat);
    light.position.set(2.22, 0.6, wz);
    group.add(light);
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 1.7), brakeMat);
  brake.position.set(-2.22, 0.62, 0);
  group.add(brake);
  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    lightBar.position.set(-0.2, 1.62, 0);
    group.add(lightBar);
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.5, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    badge.position.set(0.4, 0.6, 0);
    group.add(badge);
  }
  group.userData = { wheels, brakeMat, lightBar };
  return group;
}

export function createEntityMeshes(render) {
  const { scene } = render;
  const state = {
    player: null,
    cars: new Map(),
    peds: new Map(),
    cops: [],
    beacon: null,
    cash: null,
    tracer: null,
    tracerTimer: 0,
  };
  // Mission beacon: a tall translucent column + a ground ring.
  const beacon = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 90, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 45;
  beacon.add(column);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);
  state.beacon = beacon;
  // Cash stash: a green duffel.
  const cash = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.7, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x1e9e4a }),
  );
  cash.position.y = 0.6;
  cash.castShadow = true;
  cash.visible = false;
  scene.add(cash);
  state.cash = cash;
  // Gun tracer line.
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 }));
  scene.add(tracer);
  state.tracer = tracer;
  return state;
}

export function syncEntities(render, meshes, game) {
  const { scene } = render;
  const player = game.player;
  // Player mesh (only visible on foot).
  if (!meshes.player) {
    meshes.player = makePersonMesh(0x3a7bd5, 0xf1c27d);
    scene.add(meshes.player);
  }
  meshes.player.visible = !player.inCar;
  meshes.player.position.set(player.x, 0.15, player.z);
  meshes.player.rotation.y = -player.angle;
  // Bob while walking.
  meshes.player.position.y = 0.15 + (player.moving && !player.inCar ? Math.abs(Math.sin(game.time * 10)) * 0.08 : 0);
  if (player.inCar) meshes.player.position.y = 0.15;

  // Cars.
  const seen = new Set();
  for (const car of game.cars) {
    if (car.dead) continue;
    seen.add(car.id);
    let mesh = meshes.cars.get(car.id);
    if (!mesh) {
      mesh = makeCarMesh(car.color, car.kind === 'police');
      scene.add(mesh);
      meshes.cars.set(car.id, mesh);
    }
    mesh.position.set(car.x, 0.15, car.z);
    mesh.rotation.y = -car.angle;
    mesh.userData.brakeMat.color.setHex(car.brakeLight ? 0xff2222 : 0x550000);
    if (mesh.userData.lightBar) {
      mesh.userData.lightBar.material.color.setHex(Math.sin(game.time * 12) > 0 ? 0xff2222 : 0x2244ff);
    }
    // Wheel spin.
    for (const wheel of mesh.userData.wheels) wheel.rotation.z -= car.speed * 0.016;
  }
  for (const [id, mesh] of meshes.cars) {
    if (!seen.has(id)) {
      scene.remove(mesh);
      meshes.cars.delete(id);
    }
  }

  // Peds.
  const seenPeds = new Set();
  for (const ped of game.peds) {
    seenPeds.add(ped.id);
    let mesh = meshes.peds.get(ped.id);
    if (!mesh) {
      mesh = makePersonMesh(ped.shirt, ped.skin);
      scene.add(mesh);
      meshes.peds.set(ped.id, mesh);
    }
    mesh.position.set(ped.x, 0.15, ped.z);
    mesh.rotation.y = -ped.angle;
    if (ped.state === 'down') {
      mesh.rotation.z = Math.PI / 2;
      mesh.position.y = 0.4;
    } else {
      mesh.rotation.z = 0;
      mesh.position.y = 0.15 + (ped.speed > 0.5 ? Math.abs(Math.sin(game.time * 9 + ped.id)) * 0.06 : 0);
    }
  }
  for (const [id, mesh] of meshes.peds) {
    if (!seenPeds.has(id)) {
      scene.remove(mesh);
      meshes.peds.delete(id);
    }
  }

  // Foot cops.
  while (meshes.cops.length < game.wanted.cops.length) {
    const mesh = makePersonMesh(0x1a2a4a, 0xe0ac69);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x0d1526 }),
    );
    cap.position.y = 1.82;
    mesh.add(cap);
    scene.add(mesh);
    meshes.cops.push(mesh);
  }
  while (meshes.cops.length > game.wanted.cops.length) {
    const mesh = meshes.cops.pop();
    scene.remove(mesh);
  }
  game.wanted.cops.forEach((cop, i) => {
    const mesh = meshes.cops[i];
    mesh.visible = !cop.down;
    mesh.position.set(cop.x, 0.15, cop.z);
    mesh.rotation.y = -cop.angle;
  });

  // Beacon + cash.
  const target = game.missions.target;
  if (target && game.screen === 'play') {
    meshes.beacon.visible = true;
    meshes.beacon.position.set(target.x, 0, target.z);
    const pulse = 1 + Math.sin(game.time * 3) * 0.12;
    meshes.beacon.scale.set(pulse, 1, pulse);
  } else {
    meshes.beacon.visible = false;
  }
  const stash = game.missions.cashStash;
  if (stash) {
    meshes.cash.visible = true;
    meshes.cash.position.set(stash.x, 0.6 + Math.sin(game.time * 4) * 0.1, stash.z);
    meshes.cash.rotation.y = game.time * 1.5;
  } else {
    meshes.cash.visible = false;
  }

  // Tracer fade.
  if (meshes.tracerTimer > 0) {
    meshes.tracerTimer -= 1 / 60;
    meshes.tracer.material.opacity = Math.max(0, meshes.tracerTimer / 0.15);
  } else {
    meshes.tracer.material.opacity = 0;
  }
}

export function fireTracer(meshes, fromX, fromZ, toX, toZ) {
  const pos = meshes.tracer.geometry.attributes.position;
  pos.setXYZ(0, fromX, 1.4, fromZ);
  pos.setXYZ(1, toX, 1.2, toZ);
  pos.needsUpdate = true;
  meshes.tracerTimer = 0.15;
}

// Third-person orbit camera. `cam` is game.camera {yaw, pitch, dist}.
export function updateCamera(render, game, dt) {
  const { camera } = render;
  const player = game.player;
  const focus = player.inCar
    ? { x: player.car.x, z: player.car.z, angle: player.car.angle, speed: Math.abs(player.car.speed) }
    : { x: player.x, z: player.z, angle: player.angle, speed: player.speed };
  const cam = game.camera;
  // When moving and not dragging, ease the yaw behind the direction of travel.
  if (!game.input.dragging && focus.speed > 2) {
    const behind = focus.angle + Math.PI;
    cam.yaw += angleDiff(behind, cam.yaw) * Math.min(1, 1.6 * dt);
  }
  cam.pitch = clamp(cam.pitch, 0.08, 1.1);
  cam.dist = clamp(cam.dist, 6, 16);
  const eyeX = focus.x + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const eyeZ = focus.z + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const eyeY = 2.2 + Math.sin(cam.pitch) * cam.dist;
  camera.position.x = lerp(camera.position.x, eyeX, Math.min(1, 10 * dt));
  camera.position.y = lerp(camera.position.y, eyeY, Math.min(1, 10 * dt));
  camera.position.z = lerp(camera.position.z, eyeZ, Math.min(1, 10 * dt));
  camera.lookAt(focus.x, 1.6, focus.z);
}

// Slow cinematic orbit for the title screen.
export function updateTitleCamera(render, game, dt) {
  const { camera } = render;
  const t = game.time * 0.045;
  const cx = Math.cos(t) * 150;
  const cz = Math.sin(t) * 150;
  camera.position.x = lerp(camera.position.x, cx, Math.min(1, 2 * dt));
  camera.position.y = lerp(camera.position.y, 55, Math.min(1, 2 * dt));
  camera.position.z = lerp(camera.position.z, cz, Math.min(1, 2 * dt));
  camera.lookAt(0, 12, 0);
}
