// The ?shot= scenes behind shots.json: each one stages a real moment of the game from
// a fresh world — title over the city, a drive down a main street with a job beacon,
// a three-star police chase — so a screenshot of the staged page is a screenshot of
// the game itself, and the same seed always gives the same frame.

/**
 * Stage a scene on a live game object (the handle boot.js builds). `game` exposes the
 * player, the driver, the traffic, the crowd, the story and the camera rig.
 */
export function stageShot(name, game) {
  if (name === 'play') {
    // Mid-drive on the main drag: mission one active, traffic around, beacon ahead.
    game.hideScreens();
    game.startFresh({ cash: 450 });
    game.warpIntoCar(0, 112, Math.PI / 2);
    game.story.start(0, game.state);
    game.camera.snapBehindCar();
    game.overlay.toast('Job 1 — First Wheels: take the car to the garage', 4);
    return 'play';
  }
  if (name === 'end') {
    // A three-star chase: two patrol cars on the player's tail, heat at full glare.
    game.hideScreens();
    game.startFresh({ cash: 1250 });
    game.warpIntoCar(-56, -56, 0);
    game.setWanted(3);
    game.spawnChasePair();
    game.story.start(3, game.state);
    game.camera.snapBehindCar();
    game.overlay.toast('3 stars — lose the Solmar PD!', 4);
    return 'play';
  }
  // Default: the title screen over a slow orbit of the city at golden hour.
  game.hideScreens();
  game.startFresh({ cash: 150 });
  game.playerTo(0, 30, Math.PI);
  game.story.showMaraBeacon();
  game.camera.orbitTitle();
  game.overlay.hideHud();
  game.overlay.showScreen('title');
  return 'title';
}
