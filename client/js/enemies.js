// ════════════════════════════════════════════════════════════════════
//  ENEMIES — Sentinelle
//  Creature meccaniche aliene: nucleo scuro con un occhio emissivo e due
//  anelli che orbitano su assi diversi. Inseguono, orbitano a distanza e
//  sparano. L'occhio cambia colore quando stanno per fare fuoco: è il
//  segnale che rende leggibile il combattimento.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

export const SENT = {
  hp:          4,
  speed:       58,
  orbitDist:   72,     // distanza a cui si stabilizzano
  aggroDist:   620,    // oltre questa non ti vedono
  fireEvery:   1.9,
  telegraph:   0.45,   // preavviso prima del colpo
  turnRate:    2.2,
  damage:      12,
  radius:      3.4,
  scoreValue:  150,
};

function buildMesh() {
  const g = new THREE.Group();

  // Anche qui metalness contenuta: i nemici devono restare più scuri della
  // nave del giocatore, ma leggibili come volume, non come sagome nere.
  const shell = new THREE.MeshStandardMaterial({ color: 0x353d47, roughness: 0.52, metalness: 0.28 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x454f5b, roughness: 0.46, metalness: 0.42 });

  // nucleo: due tronchi di cono uniti, sembra un guscio chiuso
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), shell);
  g.add(core);

  // piastre esterne, disposte a spicchi
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 2.4), plate);
    p.position.set(Math.cos(a) * 1.85, 0, Math.sin(a) * 1.85);
    p.rotation.y = -a;
    p.rotation.z = 0.22;
    g.add(p);
  }

  // occhio emissivo
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x120404, emissive: 0xff3a1a, emissiveIntensity: 4.2,
    roughness: 0.2, metalness: 0.1, fog: false
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 14), eyeMat);
  eye.position.z = -1.75;
  g.add(eye);

  // alone dell'occhio: sprite additivo, si accende col preavviso
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xff5a30, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  glow.scale.setScalar(5.5);
  glow.position.z = -1.9;
  g.add(glow);

  // due anelli orbitanti su assi diversi
  const rings = [];
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(3.3 + i * 0.9, 0.13, 6, 40),
      new THREE.MeshStandardMaterial({
        color: 0x3a4550, roughness: 0.3, metalness: 0.95,
        emissive: 0x0a2230, emissiveIntensity: 1.2
      })
    );
    r.rotation.x = i === 0 ? Math.PI / 2 : 0.5;
    r.rotation.z = i === 0 ? 0 : 0.9;
    g.add(r);
    rings.push(r);
  }

  return { group: g, eyeMat, glow, rings };
}

export class Enemies {
  constructor(scene, debris, audio) {
    this.scene = scene;
    this.debris = debris;
    this.audio = audio;
    this.list = [];
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  spawnNear(pos, forward, rng = Math.random) {
    const parts = buildMesh();
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
        e.vel.addScaledVector(side, Math.sin(performance.now() / 900 + e.spin[0] * 4) * SENT.speed * dt * 1.1);

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

      // anelli in rotazione continua
      e.rings[0].rotation.z += e.spin[0] * dt;
      e.rings[1].rotation.y += e.spin[1] * dt;

      // l'occhio si carica: da rosso a bianco incandescente
      const t = e.tele;
      e.eyeMat.emissiveIntensity = 3.0 + t * 12;
      e.eyeMat.emissive.setRGB(1, 0.22 + t * 0.7, 0.10 + t * 0.75);
      e.glow.scale.setScalar(5.0 + t * 7);
      e.glow.material.opacity = 0.4 + t * 0.5;

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
    e.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.list.splice(i, 1);
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
      e.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.list.length = 0;
  }

  get count() { return this.list.length; }
}
