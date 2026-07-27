// ════════════════════════════════════════════════════════════════════
//  WEAPONS — proiettili del giocatore e dei nemici
//  Pool a dimensione fissa disegnato con InstancedMesh: un solo materiale
//  emissivo, che il bloom trasforma in tracciante luminoso.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const MAX_P = 220;

export const GUN = {
  speed:    460,
  life:     2.1,
  cooldown: 0.115,
  damage:   1,
  spread:   0.004,
};

class Pool {
  constructor(scene, color, len, rad) {
    this.items = [];
    const geo = new THREE.CapsuleGeometry(rad, len, 4, 8);
    geo.rotateX(Math.PI / 2);   // asse lungo su Z, come la direzione di volo
    // Colore oltre 1: THREE.Color regge valori HDR, ed è l'unico modo per
    // far superare al tracciante la soglia del bloom e diventare luce.
    this.mat = new THREE.MeshBasicMaterial({ color, fog: false });
    this.mat.color.multiplyScalar(5.5);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_P);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 0, 1);
  }

  spawn(pos, dir, speed, life, extra = {}) {
    if (this.items.length >= MAX_P) return;
    this.items.push({
      pos: pos.clone(),
      vel: dir.clone().multiplyScalar(speed),
      life,
      ...extra
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.items.splice(i, 1); continue; }
      p.pos.addScaledVector(p.vel, dt);
    }
    // matrici di istanza: orienta ogni tracciante lungo la sua velocità
    const n = Math.min(this.items.length, MAX_P);
    for (let i = 0; i < n; i++) {
      const p = this.items[i];
      this._q.setFromUnitVectors(this._up, p.vel.clone().normalize());
      this._m.compose(p.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.mesh.count = 0; }
}

export class Weapons {
  constructor(scene) {
    // I traccianti sono volutamente sovraesposti: è il bloom che li
    // trasforma in luce, non il colore in sé.
    this.player = new Pool(scene, 0xbdf0ff, 3.4, 0.13);
    this.enemy  = new Pool(scene, 0xff7a55, 2.6, 0.16);
    this.cool = 0;
  }

  update(dt) {
    this.cool -= dt;
    this.player.update(dt);
    this.enemy.update(dt);
  }

  // Sparo del giocatore dai punti d'arma dello scafo (per il GLB sono i
  // nodi dei cannoni del modello, letti da ship.js)
  tryFire(ship, audio) {
    if (this.cool > 0) return false;
    this.cool = GUN.cooldown;
    const fwd = ship.forward;
    for (const hp of ship.hardpoints) {
      const o = hp.clone().applyQuaternion(ship.quat).add(ship.pos);
      const d = fwd.clone();
      d.x += (Math.random() - 0.5) * GUN.spread;
      d.y += (Math.random() - 0.5) * GUN.spread;
      d.normalize();
      // eredita la velocità della nave: sparando in corsa i colpi non
      // "restano indietro", che è l'errore che fa sembrare finto lo sparo
      this.player.spawn(o, d, GUN.speed + ship.speed, GUN.life);
    }
    if (audio) audio.shoot();
    return true;
  }

  enemyFire(from, dir, audio) {
    this.enemy.spawn(from, dir, 190, 3.4);
    if (audio) audio.enemyShoot();
  }

  clear() { this.player.clear(); this.enemy.clear(); this.cool = 0; }
}
