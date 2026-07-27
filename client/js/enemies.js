// ════════════════════════════════════════════════════════════════════
//  ENEMIES — Sentinelle
//  Creature meccaniche aliene: nucleo scuro con un occhio emissivo e due
//  anelli che orbitano su assi diversi. Inseguono, orbitano a distanza e
//  sparano. L'occhio cambia colore quando stanno per fare fuoco: è il
//  segnale che rende leggibile il combattimento.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { panelSet, glowTexture } from './textures.js';
import { mergeStaticMeshes } from './ship.js';

export const SENT = {
  hp:          4,
  speed:       34,   // accelerazione: la velocità limite risulta ~85 u/s,
                     // sotto la velocità di crociera del giocatore (~119)
  orbitDist:   95,     // distanza a cui si stabilizzano
  aggroDist:   620,    // oltre questa non ti vedono
  fireEvery:   2.4,
  telegraph:   0.62,   // preavviso prima del colpo
  turnRate:    1.7,
  damage:      12,
  radius:      4.2,   // scafo dell'intercettore, non più un nucleo sferico
  scoreValue:  150,
};

// Materiali e texture condivisi da TUTTE le sentinelle: generarli per ogni
// nemico che compare costerebbe una pausa visibile a ogni spawn.
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const skin = panelSet(77, 512, { wear: 0.8, density: 6 });
  const rep = (u, v) => {
    const o = {};
    for (const k of ['map', 'roughnessMap', 'normalMap']) {
      o[k] = skin[k].clone(); o[k].needsUpdate = true; o[k].repeat.set(u, v);
    }
    return o;
  };
  SHARED = {
    // scafo alieno: grigio-verde scuro, sporco, opaco
    shell: new THREE.MeshStandardMaterial({
      color: 0x4a5148, roughness: 0.66, metalness: 0.26,
      normalScale: new THREE.Vector2(1.0, 1.0), ...rep(2, 2) }),
    plate: new THREE.MeshStandardMaterial({
      color: 0x5b6358, roughness: 0.52, metalness: 0.38,
      normalScale: new THREE.Vector2(0.8, 0.8), ...rep(3, 3) }),
    trim:  new THREE.MeshStandardMaterial({ color: 0x8b8478, roughness: 0.44, metalness: 0.70 }),
    dark:  new THREE.MeshStandardMaterial({ color: 0x1c211f, roughness: 0.62, metalness: 0.30 }),
    // varianti a doppia faccia condivise: clonarle per ogni nemico
    // impedirebbe la fusione delle geometrie in un'unica draw call
    darkDouble: new THREE.MeshStandardMaterial({ color: 0x1c211f, roughness: 0.62, metalness: 0.30, side: THREE.DoubleSide }),
    // marcatura d'unità: dà l'idea di un mezzo militare, non di un oggetto
    mark:  new THREE.MeshStandardMaterial({ color: 0x8c2a12, roughness: 0.55, metalness: 0.30 }),
    glowTex: glowTexture(128),
  };
  SHARED.shellDouble = SHARED.shell.clone();
  SHARED.shellDouble.side = THREE.DoubleSide;
  return SHARED;
}

// ─── INTERCETTORE ────────────────────────────────────────────────────
// Punta lungo -Z locale, come la nave del giocatore. Doppia fusoliera con
// carena centrale, muso sensore, quattro cannoni e due propulsori: deve
// leggersi come un mezzo pilotato, non come un oggetto astratto.
//
// Lo scafo statico è costruito UNA volta e fuso in poche geometrie (una
// per materiale). Ogni nemico riusa geometrie e materiali del template:
// 50 mesh a testa moltiplicate per sette nemici erano centinaia di draw
// call. Restano per-nemico solo occhio e nuclei dei propulsori, che si
// animano in modo indipendente.
let TEMPLATE = null;

function buildStatic(g, M) {
  // ── carena centrale ──
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 3.4, 6, 1), M.shell);
  belly.rotation.x = -Math.PI / 2; belly.rotation.z = Math.PI / 6;
  belly.scale.set(1.35, 1, 0.62);
  g.add(belly);

  // cresta dorsale
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 2.4), M.plate);
  crest.position.set(0, 0.66, 0.35);
  g.add(crest);

  // ── prua sensore: cuneo appiattito ──
  const prow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 5), M.plate);
  prow.rotation.x = -Math.PI / 2; prow.rotation.z = Math.PI / 5;
  prow.scale.set(1.3, 1, 0.55);
  prow.position.z = -2.6;
  g.add(prow);

  // cornice attorno all'occhio, come una palpebra corazzata
  const brow = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.08, 5, 18), M.trim);
  brow.position.set(0, 0.06, -3.3); brow.scale.set(1.4, 0.9, 1);
  g.add(brow);

  // rumore deterministico: il template è unico, la minutaglia dev'essere
  // uguale per tutti comunque
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (const s of [1, -1]) {
    // ── fusoliera laterale ──
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.52, 4.6, 8), M.shell);
    pod.rotation.x = -Math.PI / 2;
    pod.position.set(s * 1.9, -0.10, 0.2);
    g.add(pod);
    // punta della fusoliera
    const podNose = new THREE.Mesh(new THREE.ConeGeometry(0.40, 1.5, 8), M.plate);
    podNose.rotation.x = -Math.PI / 2;
    podNose.position.set(s * 1.9, -0.10, -3.0);
    g.add(podNose);

    // ── braccio che collega la fusoliera alla carena ──
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.34, 1.5), M.plate);
    arm.position.set(s * 1.05, -0.06, 0.5);
    arm.rotation.z = s * 0.10;
    g.add(arm);

    // ── ala a falce, inclinata in avanti ──
    const wing = new THREE.Shape();
    wing.moveTo(0.0,  0.55);
    wing.lineTo(1.85, 1.30);   // freccia INVERTITA: profilo aggressivo
    wing.lineTo(2.05, 0.55);
    wing.lineTo(0.0, -0.85);
    wing.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wing, {
      depth: 0.20, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1
    });
    const w = new THREE.Mesh(wingGeo, M.shellDouble);
    w.rotation.x = -Math.PI / 2;
    w.rotation.z = s * -0.16;
    w.scale.x = s;
    w.position.set(s * 2.15, -0.12, 0.3);
    g.add(w);

    // pinna verticale sulla punta dell'ala
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.05, 0.85), M.plate);
    fin.position.set(s * 4.05, 0.35, 1.05);
    fin.rotation.z = s * -0.22;
    g.add(fin);

    // ── cannoni: due per lato, sotto la fusoliera ──
    for (const o of [-0.22, 0.22]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 2.6, 7), M.trim);
      barrel.rotation.x = -Math.PI / 2;
      barrel.position.set(s * 1.9 + o, -0.48, -1.9);
      g.add(barrel);
    }
    const gunPod = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 1.3), M.dark);
    gunPod.position.set(s * 1.9, -0.46, -0.5);
    g.add(gunPod);

    // ── propulsore ──
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.9, 10, 1, true), M.darkDouble);
    nozzle.rotation.x = -Math.PI / 2;
    nozzle.position.set(s * 1.9, -0.10, 2.75);
    g.add(nozzle);

    // marcature d'unità
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.30), M.mark);
    stripe.position.set(s * 1.9, 0.40, -0.9);
    g.add(stripe);

    // minutaglia tecnica sulla fusoliera
    for (let i = 0; i < 4; i++) {
      const bx = new THREE.Mesh(
        new THREE.BoxGeometry(0.14 + rnd() * 0.18, 0.10, 0.20 + rnd() * 0.26),
        i % 2 ? M.trim : M.dark);
      bx.position.set(s * (1.75 + rnd() * 0.3), 0.32, -1.6 + rnd() * 3.4);
      g.add(bx);
    }
  }

  // antenne sulla cresta
  for (const s of [1, -1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.3, 5), M.trim);
    ant.position.set(s * 0.2, 1.2, 0.9);
    ant.rotation.z = s * 0.22; ant.rotation.x = 0.16;
    g.add(ant);
  }
}

// ─── template dal modello GLB (Raider) ──────────────────────────────
// Preparato una volta: geometrie e materiali CONDIVISI fra tutte le
// sentinelle, con le trasformazioni dei nodi già cotte nelle matrici.
// Il Raider è un solo scafo mesh: ogni nemico costa pochissime draw call.
let GLB = null;
function prepModel(model) {
  if (GLB) return GLB;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 8.8 / size.z;
  model.scale.setScalar(scale);
  model.rotation.y = Math.PI;      // convenzione di gioco: -Z avanti
  const shield = model.getObjectByName('raiderShield_mesh');
  if (shield) shield.visible = false;
  model.updateMatrixWorld(true);

  const meshes = [];
  model.traverse(o => {
    if (o.isMesh && o.visible) meshes.push({ geo: o.geometry, mat: o.material, mtx: o.matrixWorld.clone() });
  });
  const np = (n) => {
    const o = model.getObjectByName(n);
    return o ? o.getWorldPosition(new THREE.Vector3()) : null;
  };
  const post = new THREE.Box3().setFromObject(model);
  GLB = {
    meshes,
    thrusters: ['raider_thruster_L', 'raider_thruster_R'].map(np).filter(Boolean),
    noseZ: post.min.z,
  };
  return GLB;
}

function buildMesh(model) {
  const M = shared();
  const g = new THREE.Group();

  let nosePos, thrusterPos;
  if (model) {
    const T = prepModel(model);
    for (const t of T.meshes) {
      const m = new THREE.Mesh(t.geo, t.mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(t.mtx);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    nosePos = new THREE.Vector3(0, 0.05, T.noseZ + 0.35);
    thrusterPos = T.thrusters.map(p => p.clone().add(new THREE.Vector3(0, 0, 0.25)));
  } else {
    if (!TEMPLATE) {
      const tg = new THREE.Group();
      buildStatic(tg, M);
      TEMPLATE = [...mergeStaticMeshes(tg).always.children];
    }
    // istanze leggere del template: geometria e materiale CONDIVISI
    for (const t of TEMPLATE) {
      const m = new THREE.Mesh(t.geometry, t.material);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    nosePos = new THREE.Vector3(0, 0.06, -3.35);
    thrusterPos = [new THREE.Vector3(1.9, -0.10, 3.16), new THREE.Vector3(-1.9, -0.10, 3.16)];
  }

  // ── occhio: il sensore che si carica prima di sparare (per-nemico) ──
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x140303, emissive: 0xd41c08, emissiveIntensity: 1.3,
    roughness: 0.16, metalness: 0.1, fog: false
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 14), eyeMat);
  eye.position.copy(nosePos);
  eye.scale.set(1.5, 0.85, 1);
  g.add(eye);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: M.glowTex,        // senza map lo sprite e' un QUADRATO pieno
    color: 0xff5a30, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  glow.scale.setScalar(2.6);
  glow.position.copy(nosePos).add(new THREE.Vector3(0, 0, -0.3));
  g.add(glow);

  // nuclei caldi dei propulsori: emissivi e pulsanti, uno per lato
  const rings = [];
  for (const p of thrusterPos) {
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x120604, emissive: 0xff5518, emissiveIntensity: 3.2,
      roughness: 0.4, fog: false
    });
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.33, 14), glowMat);
    core.position.copy(p);
    g.add(core);
    rings.push(core);   // riusati per pulsare col preavviso
  }

  return { group: g, eyeMat, glow, rings };
}

export class Enemies {
  /** model: scena GLB del Raider, oppure null → sentinelle procedurali */
  constructor(scene, debris, audio, model = null) {
    this.scene = scene;
    this.debris = debris;
    this.audio = audio;
    this.model = model;
    this.list = [];
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  spawnNear(pos, forward, rng = Math.random) {
    const parts = buildMesh(this.model);
    // compaiono davanti, di lato, a distanza di avvistamento
    const off = new THREE.Vector3(
      (rng() - 0.5) * 340,
      (rng() - 0.5) * 200,
      0
    );
    const p = pos.clone().addScaledVector(forward, 420 + rng() * 260).add(off);
    parts.group.position.copy(p);
    this.scene.add(parts.group);

    this.list.push({
      ...parts,
      pos: p,
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      hp: SENT.hp,
      fire: SENT.fireEvery * (0.5 + rng()),
      tele: 0,
      spin: [(rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6],
      hitFlash: 0,
    });
    return this.list[this.list.length - 1];
  }

  update(dt, playerPos, weapons) {
    for (const e of this.list) {
      const toP = this._tmp.copy(playerPos).sub(e.pos);
      const dist = toP.length();
      toP.normalize();

      if (dist < SENT.aggroDist) {
        // avvicinati fino alla distanza d'orbita, poi mantienila
        const want = dist > SENT.orbitDist ? 1 : -0.55;
        e.vel.addScaledVector(toP, SENT.speed * want * dt * 2.2);
        // deriva laterale: senza questa restano immobili davanti a te
        // e sembrano bersagli da tiro al piattello
        const side = new THREE.Vector3().crossVectors(toP, new THREE.Vector3(0, 1, 0)).normalize();
        e.vel.addScaledVector(side, Math.sin(performance.now() / 1400 + e.spin[0] * 4) * SENT.speed * dt * 0.7);

        // punta il giocatore
        this._m.lookAt(e.pos, playerPos, new THREE.Vector3(0, 1, 0));
        this._q.setFromRotationMatrix(this._m);
        e.quat.slerp(this._q, 1 - Math.exp(-SENT.turnRate * dt));

        // fuoco con preavviso
        e.fire -= dt;
        if (e.fire <= SENT.telegraph && e.fire > 0) {
          e.tele = 1 - (e.fire / SENT.telegraph);
        } else if (e.fire <= 0) {
          const dir = this._tmp.copy(playerPos).sub(e.pos).normalize();
          const muzzle = e.pos.clone().addScaledVector(dir, 2.4);
          weapons.enemyFire(muzzle, dir, this.audio);
          e.fire = SENT.fireEvery * (0.75 + Math.random() * 0.5);
          e.tele = 0;
        }
      } else {
        e.tele = 0;
        e.vel.multiplyScalar(1 - Math.min(1, 0.8 * dt));
      }

      e.vel.multiplyScalar(1 - Math.min(1, 0.9 * dt));
      e.pos.addScaledVector(e.vel, dt);
      e.group.position.copy(e.pos);
      e.group.quaternion.copy(e.quat);

      // i propulsori pulsano: più caldi quando la sentinella si avvicina
      const push = dist < SENT.aggroDist ? 1 : 0.35;
      for (const core of e.rings) {
        core.material.emissiveIntensity = 2.2 + push * 2.0 + Math.sin(performance.now()/120 + e.spin[0]*9) * 0.5;
      }

      // l'occhio si carica: da rosso a bianco incandescente
      const t = e.tele;
      e.eyeMat.emissiveIntensity = 1.2 + t * 3.4;
      e.eyeMat.emissive.setRGB(0.85, 0.10 + t * 0.55, 0.03 + t * 0.45);
      e.glow.scale.setScalar(2.4 + t * 2.6);
      e.glow.material.opacity = 0.34 + t * 0.40;

      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        e.group.scale.setScalar(1 + e.hitFlash * 0.5);
      } else {
        e.group.scale.setScalar(1);
      }
    }
  }

  // Colpito da un proiettile. Ritorna 'dead' | 'hit' | null
  damageAt(pos, radius = SENT.radius) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (pos.distanceTo(e.pos) > radius + 1.2) continue;
      e.hp--;
      e.hitFlash = 0.14;
      this.debris.burst(pos, 14, {
        speed: 26, size: 0.5, life: 0.4,
        color: new THREE.Color(0xffd9a0), color2: new THREE.Color(0xff6a30)
      });
      if (e.hp <= 0) { this._destroy(i); return 'dead'; }
      return 'hit';
    }
    return null;
  }

  _destroy(i) {
    const e = this.list[i];
    this.debris.burst(e.pos, 150, {
      speed: 62, size: 1.15, life: 1.5, drag: 0.5,
      color: new THREE.Color(0xffb060), color2: new THREE.Color(0xff3a12)
    });
    this.debris.burst(e.pos, 60, {
      speed: 24, size: 2.0, life: 2.2, drag: 1.3,
      color: new THREE.Color(0x552211), color2: new THREE.Color(0x221008)
    });
    if (this.audio) this.audio.explosion(1.5);
    this.scene.remove(e.group);
    this._disposeOwn(e.group);
    this.list.splice(i, 1);
  }

  // Libera solo le geometrie proprie del nemico (occhio, nuclei): quelle
  // del template (procedurale o GLB) sono condivise da tutti i nemici e
  // distruggerle romperebbe gli altri.
  _disposeOwn(group) {
    const shared = new Set(TEMPLATE ? TEMPLATE.map(t => t.geometry) : []);
    if (GLB) for (const t of GLB.meshes) shared.add(t.geo);
    group.traverse(o => {
      if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
    });
  }

  // Il nemico che sta toccando il giocatore, se c'è
  touching(pos, radius) {
    for (const e of this.list) {
      if (pos.distanceTo(e.pos) < SENT.radius + radius) return e;
    }
    return null;
  }

  clear() {
    for (const e of this.list) {
      this.scene.remove(e.group);
      this._disposeOwn(e.group);
    }
    this.list.length = 0;
  }

  get count() { return this.list.length; }
}
