// The HUD: DOM panels, the live 2D minimap, the message feed and the menus.
// The world owns the simulation; this file only reads it and paints text.

import { FONT, WEAPONS } from './config.js';

function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHud(doc) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    hud: $('hud'), stars: $('stars'), cash: $('cash'), healthFill: $('health-fill'),
    healthText: $('health-text'), clock: $('clock'), speed: $('speed'), speedBox: $('speed-box'),
    weapon: $('weapon'), objectiveTitle: $('objective-title'), objectiveBrief: $('objective-brief'),
    objectiveHint: $('objective-hint'), timer: $('timer'), progressWrap: $('progress-wrap'),
    progressFill: $('progress-fill'), feed: $('feed'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    minimap: $('minimap'), menu: $('menu'), pause: $('pause'), end: $('end'),
    endTitle: $('end-title'), endText: $('end-text'), endButton: $('end-button'),
    continueBtn: $('btn-continue'), newBtn: $('btn-new'), helpBtn: $('btn-help'),
    resumeBtn: $('btn-resume'), restartBtn: $('btn-restart'), quitBtn: $('btn-quit'),
    help: $('help'), helpClose: $('btn-help-close'), saveNote: $('save-note'),
    muteNote: $('mute-note'),
  };
  const mapCtx = el.minimap.getContext('2d');
  const feedItems = [];
  let bannerTimer = null;

  function logMessage(text) {
    feedItems.push(text);
    while (feedItems.length > 4) feedItems.shift();
    el.feed.innerHTML = feedItems.map((t) => `<div>${t}</div>`).join('');
  }
  function showBanner(title, sub) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2600);
  }

  function drawMinimap(W) {
    const ctx = mapCtx;
    const S = 200;
    const mx = (x) => ((x + 300) / 600) * S;
    const my = (z) => ((z + 300) / 680) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20242a'; ctx.fillRect(0, 0, S, S);
    // Sea and sand at the south edge.
    ctx.fillStyle = '#1d6f8f'; ctx.fillRect(0, my(292), S, S - my(292));
    ctx.fillStyle = '#e8cf9a'; ctx.fillRect(0, my(250), S, my(292) - my(250));
    // Roads.
    ctx.strokeStyle = '#4a4f58'; ctx.lineWidth = 3;
    for (let v = -240; v <= 240; v += 60) {
      ctx.beginPath(); ctx.moveTo(mx(v), my(-300)); ctx.lineTo(mx(v), my(250)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx(-300), my(v)); ctx.lineTo(mx(300), my(v)); ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#ffd27a';
    for (const [x, z] of [[-60, -60], [60, 180], [-120, 60], [180, -180], [264, 296], [-216, 300]]) {
      ctx.beginPath(); ctx.arc(mx(x), my(z), 3, 0, Math.PI * 2); ctx.fill();
    }
    // Beacon.
    const m = W.beaconPos;
    if (m && m.visible) {
      const pulse = 5 + Math.sin(performance.now() / 200) * 2;
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath(); ctx.arc(mx(m.x), my(m.z), pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx(m.x), my(m.z), pulse + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // Police.
    ctx.fillStyle = '#4f8cff';
    for (const pc of W.policeCars) { ctx.beginPath(); ctx.arc(mx(pc.x), my(pc.z), 3, 0, Math.PI * 2); ctx.fill(); }
    for (const cop of W.cops) {
      if (cop.dead) continue;
      ctx.fillStyle = '#7fa8ff';
      ctx.beginPath(); ctx.arc(mx(cop.x), my(cop.z), 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Traffic.
    ctx.fillStyle = '#9a9a9a';
    for (const v of W.vehicles) {
      if (v.kind !== 'traffic') continue;
      ctx.fillRect(mx(v.x) - 1.5, my(v.z) - 1.5, 3, 3);
    }
    // Player arrow.
    const px = mx(W.player.x); const py = my(W.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(W.player.angle);
    ctx.fillStyle = W.player.vehicle || W.player.boat ? '#35e0ff' : '#ff8c2a';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
  }

  function update(W, mission, screen) {
    const st = W.state;
    const p = W.player;
    el.stars.textContent = '★'.repeat(st.wanted) + '☆'.repeat(5 - st.wanted);
    el.stars.className = st.wanted > 0 ? 'wanted-hot' : '';
    el.cash.textContent = `$${st.cash.toLocaleString('en-US')}`;
    el.healthFill.style.width = `${Math.max(0, st.health)}%`;
    el.healthFill.style.background = st.health > 50 ? '#4fc46a' : st.health > 25 ? '#e8a83a' : '#d82a2a';
    el.healthText.textContent = `HP ${Math.ceil(st.health)}`;
    el.clock.textContent = `${fmtClock(st.timeHours)}${st.night ? ' 🌙' : ' ☀️'}`;
    if (p.vehicle || p.boat) {
      const spd = p.vehicle ? Math.abs(p.vehicle.speed) : Math.abs(W.playerBoat.speed);
      el.speedBox.style.display = 'block';
      el.speed.textContent = `${Math.round(spd * 3.6)} km/h`;
    } else {
      el.speedBox.style.display = 'none';
    }
    const w = WEAPONS[p.weapon];
    el.weapon.textContent = `${w.name}  ${p.reloading > 0 ? 'RELOADING…' : `${p.ammo[p.weapon]} / ${w.mag}`}   [1/2/3]`;
    const obj = mission.objectiveText();
    el.objectiveTitle.textContent = obj.title;
    el.objectiveBrief.textContent = obj.brief;
    el.objectiveHint.textContent = obj.hint || '';
    if (mission.timeLeft > 0 && mission.stage !== 'free') {
      const t = Math.max(0, Math.ceil(mission.timeLeft));
      el.timer.textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      el.timer.style.color = t < 30 ? '#ff6a5a' : '#ffe9a8';
    } else {
      el.timer.textContent = '';
    }
    const prog = mission.progress;
    if (prog > 0) {
      el.progressWrap.style.display = 'block';
      el.progressFill.style.width = `${Math.round(prog * 100)}%`;
    } else {
      el.progressWrap.style.display = 'none';
    }
    drawMinimap({
      player: p, playerBoat: W.playerBoat, policeCars: W.policeCars, cops: W.cops,
      vehicles: W.vehicles, beaconPos: W.beaconPos,
    });
    el.hud.style.display = screen === 'play' ? 'block' : 'none';
    el.menu.style.display = screen === 'title' ? 'flex' : 'none';
    el.pause.style.display = screen === 'paused' ? 'flex' : 'none';
    el.end.style.display = (screen === 'busted' || screen === 'wasted') ? 'flex' : 'none';
    el.help.style.display = screen === 'help' ? 'flex' : 'none';
  }

  function showEnd(kind, text) {
    el.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    el.endTitle.style.color = kind === 'busted' ? '#4f8cff' : '#ff6a5a';
    el.endText.textContent = text;
    el.endButton.textContent = 'Continue — respawn';
  }

  function bind(handlers) {
    el.newBtn.addEventListener('click', () => handlers.newGame());
    el.continueBtn.addEventListener('click', () => handlers.continueGame());
    el.helpBtn.addEventListener('click', () => handlers.help());
    el.helpClose.addEventListener('click', () => handlers.backToTitle());
    el.resumeBtn.addEventListener('click', () => handlers.resume());
    el.restartBtn.addEventListener('click', () => handlers.restartMission());
    el.quitBtn.addEventListener('click', () => handlers.quitToTitle());
    el.endButton.addEventListener('click', () => handlers.respawn());
  }

  return {
    update, logMessage, showBanner, showEnd, bind,
    setContinueVisible(visible, note) {
      el.continueBtn.style.display = visible ? 'block' : 'none';
      el.saveNote.textContent = note || '';
    },
    setMuted(muted) { el.muteNote.textContent = muted ? '🔇 Muted (M)' : '🔊 Sound on (M)'; },
  };
}
