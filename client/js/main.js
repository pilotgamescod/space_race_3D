// ════════════════════════════════════════════════════════════════════
//  MAIN — macchina a stati, telecamera e loop
//
//  Stati: 'menu' → 'playing' → 'dead' → 'menu'
//  Nel menu la scena 3D gira già: la telecamera orbita lentamente intorno
//  alla navicella. Non è un'immagine, è il gioco in attesa.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { Renderer, FOV_BASE, FOV_BOOST } from './render.js';
import { Ship, FLY } from './ship.js';
import { Field } from './field.js';
import { Input } from './input.js';
import { Debris } from './debris.js';
import { Weapons, GUN } from './weapons.js';
import { Enemies, SENT } from './enemies.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const bootBar = $('boot-bar'), bootMsg = $('boot-msg');
const step = (p, m) => { if (bootBar) bootBar.style.width = p + '%'; if (bootMsg) bootMsg.textContent = m; };

step(12, 'contesto WebGL');
const R = new Renderer();

step(32, 'navicella');
const ship = new Ship();
R.scene.add(ship.group);

step(48, 'sistema particellare');
const debris = new Debris(R.scene);

step(62, 'campo di asteroidi');
const audio = new Audio();
const field = new Field(R.scene, debris, audio);
field.update(ship.pos, 0);

step(78, 'armamento e ostili');
const weapons = new Weapons(R.scene);
const enemies = new Enemies(R.scene, debris, audio);

step(92, 'comandi');
const input = new Input();

// ─── stato di gioco ─────────────────────────────────────────────────
const G = {
  // menu | playing | paused | destroying | dead
  state: 'menu',
  combat: false,
  score: 0,
  kills: 0,
  rocksDestroyed: 0,
  time: 0,
  spawnTimer: 6,
  best: +(localStorage.getItem('sr3d_best') || 0),
  dofOn: false,
  muted: localStorage.getItem('sr3d_mute') === '1',
};
audio.setMuted(G.muted);

// ─── elementi di interfaccia ────────────────────────────────────────
const ui = {
  boot: $('boot'), menu: $('menu'), hud: $('hud'), over: $('over'), pause: $('pause'),
  thr: $('b-thr'), thrN: $('n-thr'),
  hp: $('b-hp'), hpN: $('n-hp'),
  ab: $('b-ab'), abN: $('n-ab'),
  spd: $('n-spd'), score: $('n-score'), kills: $('n-kills'),
  fps: $('d-fps'), rocks: $('d-rocks'), calls: $('d-calls'), parts: $('d-parts'), foes: $('d-foes'),
  reticle: $('reticle'),
  menuBest: $('menu-best'),
  ovScore: $('ov-score'), ovKills: $('ov-kills'), ovRocks: $('ov-rocks'), ovTime: $('ov-time'), ovBest: $('ov-best'),
  flash: $('flash'), warn: $('warn'),
  mute: $('btn-mute'),
};

function setState(s) {
  G.state = s;
  ui.menu.classList.toggle('on',  s === 'menu');
  ui.hud.classList.toggle('on',   s === 'playing' || s === 'paused');
  ui.over.classList.toggle('on',  s === 'dead');
  ui.pause.classList.toggle('on', s === 'paused');
  ui.reticle.style.opacity = s === 'playing' ? '1' : '0';
  document.body.style.cursor = s === 'playing' ? 'none' : 'default';
  if (s !== 'playing') audio.engine(0, false);
}

function startGame() {
  audio.init();               // richiede un gesto utente: siamo dentro un click
  ship.reset();
  field.reset();
  weapons.clear();
  enemies.clear();
  G.score = 0; G.kills = 0; G.rocksDestroyed = 0; G.time = 0; G.spawnTimer = 5;
  field.update(ship.pos, 0);
  // mantieni la modalità di vista scelta fra una partita e l'altra
  ship.combat = G.combat;
  if (ship.canopy)   ship.canopy.visible   = !G.combat;
  if (ship.frameArc) ship.frameArc.visible = !G.combat;
  document.body.classList.toggle('cockpit', G.combat);
  // posiziona la camera senza interpolazione, per non partire con una spazzata
  camPos.copy(G.combat ? CAM.cockpit : CAM.offset).applyQuaternion(ship.quat).add(ship.pos);
  R.camera.position.copy(camPos);
  R.camera.quaternion.copy(ship.quat);
  R.camera.fov = G.combat ? CAM.cockFov : FOV_BASE;
  R.camera.updateProjectionMatrix();
  setState('playing');
}

function die() {
  audio.death();
  debris.burst(ship.pos, 260, {
    speed: 78, size: 1.5, life: 2.0, drag: 0.45,
    color: new THREE.Color(0xffd7a0), color2: new THREE.Color(0xff4a18)
  });
  G.best = Math.max(G.best, Math.round(G.score));
  localStorage.setItem('sr3d_best', String(G.best));
  ui.ovScore.textContent = Math.round(G.score).toLocaleString('it-IT');
  ui.ovKills.textContent = G.kills;
  ui.ovRocks.textContent = G.rocksDestroyed;
  ui.ovTime.textContent  = fmtTime(G.time);
  ui.ovBest.textContent  = G.best.toLocaleString('it-IT');
  setState('dead');
}

const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

$('btn-start').addEventListener('click', startGame);
$('btn-retry').addEventListener('click', startGame);
$('btn-menu').addEventListener('click',  () => setState('menu'));
ui.mute.addEventListener('click', () => {
  G.muted = !G.muted;
  audio.setMuted(G.muted);
  localStorage.setItem('sr3d_mute', G.muted ? '1' : '0');
  ui.mute.textContent = G.muted ? 'audio disattivato' : 'audio attivo';
  toast(G.muted ? 'audio disattivato  ·  M' : 'audio attivo  ·  M');
});
ui.mute.textContent = G.muted ? 'audio disattivato' : 'audio attivo';

// ─── schermo intero ─────────────────────────────────────────────────
// Va invocato da un gesto dell'utente, altrimenti il browser lo rifiuta.
function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el)
      .then(() => toast('schermo intero — F o ESC per uscire'))
      .catch(e => toast('schermo intero rifiutato: ' + e.message));
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
}
function syncFsLabel() {
  const on = !!document.fullscreenElement;
  $('btn-fs').textContent = on ? 'esci da schermo intero' : 'schermo intero';
}
document.addEventListener('fullscreenchange', syncFsLabel);
$('btn-fs').addEventListener('click', toggleFullscreen);

// ─── avvisi a schermo ───────────────────────────────────────────────
// Servono perché un'impostazione attivata da tastiera senza riscontro
// visibile sembra un guasto: è quello che è successo con la sfocatura.
let toastT = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2100);
}

// ─── pausa e abbandono ──────────────────────────────────────────────
function pauseGame()  { if (G.state === 'playing') setState('paused'); }
function resumeGame() { if (G.state === 'paused')  { last = performance.now(); setState('playing'); } }

// Abbandonare non è "uscire dal menu": la navicella salta in aria. Così la
// scelta ha un peso, e in una partita fra amici non si usa per barare.
function abandonMission() {
  if (G.state !== 'paused' && G.state !== 'playing') return;
  setState('destroying');
  audio.death();
  debris.burst(ship.pos, 300, {
    speed: 86, size: 1.6, life: 2.2, drag: 0.42,
    color: new THREE.Color(0xffd7a0), color2: new THREE.Color(0xff4a18)
  });
  debris.burst(ship.pos, 90, {
    speed: 26, size: 3.0, life: 3.0, drag: 1.2,
    color: new THREE.Color(0x4a2410), color2: new THREE.Color(0x1a0d06)
  });
  addShake(1);
  ship.group.visible = false;
  setTimeout(() => {
    ship.group.visible = true;
    setCombat(false);
    ship.reset();
    weapons.clear();
    enemies.clear();
    setState('menu');
  }, 2000);
}

$('btn-resume').addEventListener('click', resumeGame);
$('btn-view').addEventListener('click', () => setCombat(!G.combat));
$('btn-abandon').addEventListener('click', abandonMission);

input.onKey = (code) => {
  if (code === 'KeyC') {
    G.dofOn = R.toggleDof();
    toast('profondità di campo ' + (G.dofOn ? 'attiva' : 'spenta') + '  ·  C');
  }
  if (code === 'KeyM') ui.mute.click();
  if (code === 'KeyF') toggleFullscreen();
  if (code === 'KeyV' && (G.state === 'playing' || G.state === 'paused')) setCombat(!G.combat);
  if (code === 'Escape') {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
  }
  if (code === 'Enter' && (G.state === 'menu' || G.state === 'dead')) startGame();
};

// ─── telecamera ─────────────────────────────────────────────────────
const CAM = {
  // ESPLORAZIONE — inseguimento esterno: vedi molto, manovri meno preciso
  offset:    new THREE.Vector3(0, 2.0, 9.6),
  posLag:    5.4,
  rotLag:    7.0,
  lookAhead: 7.5,
  // COMBATTIMENTO — dentro la cabina, dietro il vetro. Campo visivo più
  // ampio per la consapevolezza, ritardo quasi nullo per la mira.
  // Posizione dell'occhio del pilota: appena DENTRO la parte anteriore del
  // tettuccio. Più indietro (era -1.15) la camera finiva dentro la fusoliera
  // e lo scafo riempiva mezzo schermo.
  cockpit:   new THREE.Vector3(0, 0.34, -2.15),
  cockRot:   22.0,   // inseguimento della rotazione: quasi istantaneo
  cockFov:   80,
  cockFovBoost: 96,
};
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
const upV = new THREE.Vector3();

camPos.copy(CAM.offset).applyQuaternion(ship.quat).add(ship.pos);
R.camera.position.copy(camPos);

// scuotimento della camera, riusato per colpi ed esplosioni
let shake = 0;
const addShake = (v) => { shake = Math.min(1, shake + v); };

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
let booted = false;

step(100, 'pronto');

// Un'eccezione dentro requestAnimationFrame interrompe il loop senza dire
// niente: schermo fermo e nessun errore visibile. Questo involucro la fa
// emergere invece di lasciare il gioco morto in silenzio.
function frame(now) {
  try { frameBody(now); }
  catch (e) {
    const box = document.getElementById('err');
    box.style.display = 'block';
    box.textContent = 'ERRORE NEL LOOP (frame interrotto)\n' + (e && e.stack || e);
    return;   // non riprogrammo: evito migliaia di errori identici
  }
  requestAnimationFrame(frame);
}

function frameBody(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if      (G.state === 'playing')    updatePlaying(dt);
  else if (G.state === 'paused')     { /* congelato: si rende, non si aggiorna */ }
  else if (G.state === 'destroying') { field.update(ship.pos, dt); updateCamera(dt); }
  else                               updateIdle(dt);

  // in pausa anche i detriti si fermano, altrimenti non è una pausa
  if (G.state !== 'paused') debris.update(dt);
  R.syncSky();

  // scuotimento applicato alla posizione finale della camera
  shake = Math.max(0, shake - dt * 2.2);
  if (shake > 0.001) {
    const a = shake * shake * 1.15;
    R.camera.position.x += (Math.random() * 2 - 1) * a;
    R.camera.position.y += (Math.random() * 2 - 1) * a;
    R.camera.position.z += (Math.random() * 2 - 1) * a;
  }

  R.render();
  updateHud(dt);

  if (!booted) {
    booted = true;
    ui.boot.classList.add('done');
    setState('menu');
  }
}

// ─── menu: la camera orbita intorno alla nave ───────────────────────
let orbit = 0;
function updateIdle(dt) {
  orbit += dt * 0.16;
  // la nave deriva piano e ruota su sé stessa: sembra in attesa, non spenta
  ship.quat.setFromEuler(new THREE.Euler(Math.sin(orbit * 0.7) * 0.12, orbit * 0.35, Math.sin(orbit) * 0.16));
  ship.group.quaternion.copy(ship.quat);
  ship.group.position.copy(ship.pos);
  ship.throttle = 0.22 + Math.sin(orbit * 1.3) * 0.06;
  ship._updateEngines(dt);

  const r = 14.0, h = 2.6;
  R.camera.position.set(
    ship.pos.x + Math.cos(orbit) * r,
    ship.pos.y + h + Math.sin(orbit * 0.6) * 1.5,
    ship.pos.z + Math.sin(orbit) * r
  );
  // Guardo un punto a SINISTRA della nave, così la nave finisce nella metà
  // destra del quadro e lascia libero il testo del menu.
  tmpV.subVectors(R.camera.position, ship.pos).cross(upV.set(0, 1, 0)).normalize();
  tmpV2.copy(ship.pos).addScaledVector(tmpV, 5.2).add(upV.set(0, -0.8, 0));
  R.camera.lookAt(tmpV2);
  R.camera.fov += (FOV_BASE - R.camera.fov) * (1 - Math.exp(-3 * dt));
  R.camera.updateProjectionMatrix();

  field.update(ship.pos, dt);
  weapons.update(dt);
}

// ─── partita ────────────────────────────────────────────────────────
function updatePlaying(dt) {
  G.time += dt;
  G.score += dt * 4;   // sopravvivere vale punti

  const aim = input.update();
  ship.update(dt, input, aim);
  field.update(ship.pos, dt);

  // fuoco
  if (input.fire) weapons.tryFire(ship, audio);
  weapons.update(dt);

  // ── proiettili del giocatore contro rocce e nemici ──
  const pl = weapons.player.items;
  for (let i = pl.length - 1; i >= 0; i--) {
    const p = pl[i];
    const onEnemy = enemies.damageAt(p.pos);
    if (onEnemy) {
      pl.splice(i, 1);
      if (onEnemy === 'dead') {
        G.kills++; G.score += SENT.scoreValue; addShake(0.45);
      }
      continue;
    }
    const rock = field.hitTest(p.pos, 0.4);
    if (rock) {
      const res = field.damage(rock, p.pos);
      pl.splice(i, 1);
      if (res === 'destroyed') {
        G.rocksDestroyed++;
        G.score += Math.round(8 + rock.scale * 4);
        addShake(Math.min(0.5, 0.08 + rock.scale * 0.025));
      }
    }
  }

  // ── proiettili nemici contro il giocatore ──
  const en = weapons.enemy.items;
  for (let i = en.length - 1; i >= 0; i--) {
    if (en[i].pos.distanceTo(ship.pos) < 2.2) {
      en.splice(i, 1);
      hurt(SENT.damage, false);
    }
  }

  // ── urto contro le rocce ──
  const hit = field.hitTest(ship.pos, 1.6);
  if (hit) {
    tmpV.copy(ship.pos).sub(hit.pos);
    // Se la nave finisce esattamente al centro della roccia, il vettore è
    // nullo e normalize() dà (0,0,0): la spinta di uscita sarebbe zero e la
    // nave resterebbe incastrata dentro per sempre. Direzione di scampo.
    if (tmpV.lengthSq() < 1e-6) tmpV.copy(ship.up).multiplyScalar(-1);
    tmpV.normalize();
    const push = (hit.radius + 1.7) - ship.pos.distanceTo(hit.pos);
    ship.pos.addScaledVector(tmpV, push);
    ship.vel.addScaledVector(tmpV, ship.speed * 0.5);
    ship.vel.multiplyScalar(0.5);
    hurt(Math.min(38, 8 + hit.scale * 1.6), true);
    debris.burst(ship.pos, 26, {
      speed: 24, size: 0.6, life: 0.5,
      color: new THREE.Color(0xffcf9a), color2: new THREE.Color(0xff7030)
    });
  }

  // ── urto contro un nemico ──
  const foe = enemies.touching(ship.pos, 1.8);
  if (foe) {
    tmpV.copy(ship.pos).sub(foe.pos).normalize();
    ship.pos.addScaledVector(tmpV, 4);
    ship.vel.addScaledVector(tmpV, 40);
    hurt(22, true);
  }

  // ── comparsa dei nemici, sempre più frequente ──
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0 && enemies.count < 7) {
    enemies.spawnNear(ship.pos, ship.forward);
    G.spawnTimer = Math.max(4.5, 14 - G.time * 0.06);
  }
  enemies.update(dt, ship.pos, weapons);

  audio.engine(ship.throttle, ship.boosting);

  updateCamera(dt);
}

// ─── telecamera: due modalità ───────────────────────────────────────
function updateCamera(dt) {
  if (G.combat) {
    // Dentro la cabina: la camera è solidale alla nave, con un filo di
    // ritardo per non essere rigida come un blocco di ferro.
    tmpV.copy(CAM.cockpit).applyQuaternion(ship.quat).add(ship.pos);
    camPos.lerp(tmpV, 1 - Math.exp(-26 * dt));
    R.camera.position.copy(camPos);
    R.camera.quaternion.slerp(ship.quat, 1 - Math.exp(-CAM.cockRot * dt));

    const wantFov = ship.boosting ? CAM.cockFovBoost : CAM.cockFov;
    R.camera.fov += (wantFov - R.camera.fov) * (1 - Math.exp(-5.5 * dt));
    R.camera.updateProjectionMatrix();
    R.setFocus(60);   // in cabina si mette a fuoco lontano, non lo scafo
    return;
  }

  // Inseguimento esterno
  tmpV.copy(CAM.offset).applyQuaternion(ship.quat).add(ship.pos);
  camPos.lerp(tmpV, 1 - Math.exp(-CAM.posLag * dt));
  R.camera.position.copy(camPos);

  camLook.copy(ship.forward).multiplyScalar(CAM.lookAhead).add(ship.pos);
  upV.copy(ship.up);
  tmpM.lookAt(camPos, camLook, upV);
  tmpQ.setFromRotationMatrix(tmpM);
  R.camera.quaternion.slerp(tmpQ, 1 - Math.exp(-CAM.rotLag * dt));

  const wantFov = ship.boosting ? FOV_BOOST : FOV_BASE;
  R.camera.fov += (wantFov - R.camera.fov) * (1 - Math.exp(-4.5 * dt));
  R.camera.updateProjectionMatrix();
  R.setFocus(R.camera.position.distanceTo(ship.pos));
}

// ─── commutazione esplorazione / combattimento ──────────────────────
function setCombat(on) {
  G.combat = on;
  ship.combat = on;
  document.body.classList.toggle('cockpit', on);
  // La cabina è trasparente ma il telaio e il muso, visti da dentro a due
  // centimetri, occuperebbero mezzo schermo: li nascondo.
  if (ship.canopy)  ship.canopy.visible  = !on;
  if (ship.frameArc) ship.frameArc.visible = !on;
  // riposiziona subito, senza interpolazione, per evitare una spazzata
  tmpV.copy(on ? CAM.cockpit : CAM.offset).applyQuaternion(ship.quat).add(ship.pos);
  camPos.copy(tmpV);
  R.camera.position.copy(camPos);
  R.camera.quaternion.copy(ship.quat);
  toast(on ? 'combattimento — manovrabilità piena  ·  V' : 'esplorazione — vista ampia  ·  V');
}

function hurt(amount, heavy) {
  if (ship.invuln > 0) return;
  const dead = ship.damage(amount);
  audio.hit(heavy);
  addShake(heavy ? 0.75 : 0.4);
  ui.flash.style.opacity = heavy ? '0.5' : '0.3';
  setTimeout(() => { ui.flash.style.opacity = '0'; }, 90);
  if (dead) die();
  else if (ship.hull <= 30) audio.alarm();
}

// ─── HUD ────────────────────────────────────────────────────────────
let hudAcc = 0;
function updateHud(dt) {
  ui.reticle.style.transform = `translate(${input.mx - 36}px, ${input.my - 36}px)`;

  if (G.state === 'playing') {
    const thr = Math.round(ship.throttle * 100);
    ui.thr.style.width = thr + '%'; ui.thrN.textContent = thr + '%';
    const hp = Math.round(ship.hull);
    ui.hp.style.width = hp + '%'; ui.hpN.textContent = hp + '%';
    ui.hp.style.background = hp > 55 ? '' : hp > 25 ? '#ffc061' : '#ff5a3c';
    const ab = Math.round(ship.after);
    ui.ab.style.width = ab + '%'; ui.abN.textContent = ab + '%';
    ui.spd.textContent = Math.round(ship.speed);
    ui.score.textContent = Math.round(G.score).toLocaleString('it-IT');
    ui.kills.textContent = G.kills;
    ui.warn.classList.toggle('on', ship.hull <= 30);
  }

  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) {
    ui.fps.textContent   = Math.round(fpsN / fpsAcc);
    ui.rocks.textContent = field.activeRocks;
    ui.calls.textContent = R.info.calls;
    ui.parts.textContent = debris.live || 0;
    ui.foes.textContent  = enemies.count;
    fpsAcc = 0; fpsN = 0;
  }
  ui.menuBest.textContent = G.best.toLocaleString('it-IT');
}

addEventListener('resize', () => debris.resize());
requestAnimationFrame(frame);

window.SR = {
  R, ship, field, enemies, weapons, debris, audio, input, G, THREE, CAM, FLY,
  startGame, setState, setCombat, pauseGame, resumeGame, abandonMission, toggleFullscreen, toast,
};
