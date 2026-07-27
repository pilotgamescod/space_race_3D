// ════════════════════════════════════════════════════════════════════
//  FIELD — campo di asteroidi infinito e distruttibile
//
//  Lo spazio è diviso in settori cubici. Attorno al giocatore restano
//  popolati solo i settori entro un raggio; il contenuto di ogni settore è
//  deterministico (seed dalle coordinate), quindi tornando indietro
//  ritrovi le stesse rocce: mondo infinito, niente da salvare.
//
//  Tre famiglie di materiale (roccia / ghiaccio / minerale) per due
//  geometrie, con colore variato per istanza. Tutto in 6 draw call.
//  I massi grandi, se distrutti, si spezzano in frammenti liberi.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const CHUNK    = 340;   // lato del settore → rocce fino a ~1020 unità
const RADIUS   = 3;     // settori attivi per lato (7³ = 343 settori)
const PER_MIN  = 2, PER_MAX = 7;
const CAPACITY = 900;   // istanze massime per (famiglia × geometria)

export const ROCK = {
  bigThreshold: 7,     // oltre questa scala si frammenta invece di sparire
  fragments:    3,
  hpSmall:      1,
  hpBig:        3,
};

function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}
function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// famiglia 0 = roccia, 1 = ghiaccio, 2 = minerale
const FAMILY = [
  { name: 'roccia',   base: 0xb4aca0, spread: 0.22, rough: 0.95, metal: 0.04, emissive: 0x000000, ei: 0,    weight: 0.68 },
  { name: 'ghiaccio', base: 0xa8cadf, spread: 0.14, rough: 0.34, metal: 0.10, emissive: 0x0a2430, ei: 0.35, weight: 0.20 },
  { name: 'minerale', base: 0x8f6b48, spread: 0.18, rough: 0.62, metal: 0.45, emissive: 0x8f3a0c, ei: 0.50, weight: 0.12 },
];

export class Field {
  constructor(scene, debris, audio) {
    this.scene  = scene;
    this.debris = debris;
    this.audio  = audio;
    this.chunks = new Map();      // "x,y,z" -> [rocce]
    this.free   = [];             // frammenti liberi, non legati a un settore
    this.dead   = new Set();      // id delle rocce distrutte (persistono)
    this.rocks  = [];             // tutte le rocce attive di questo frame
    this.planets = null;          // impostato da main.js: zone di esclusione

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();

    this.meshes = this._buildMeshes();
  }

  // Rumore di valore 3D con interpolazione morbida. Serve rumore COERENTE:
  // spostando ogni vertice a caso in modo indipendente si ottiene una
  // superficie accartocciata, non un sasso.
  _noise3(seed) {
    const P = new Uint8Array(512);
    const rnd = rngFrom(seed);
    for (let i = 0; i < 256; i++) P[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = P[i]; P[i] = P[j]; P[j] = t;
    }
    for (let i = 0; i < 256; i++) P[256 + i] = P[i];
    const h = (x, y, z) => (P[(P[(P[x & 255] + y) & 255] + z) & 255] / 255) * 2 - 1;
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;

    return (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
      const c = (dx, dy, dz) => h(xi + dx, yi + dy, zi + dz);
      return lerp(
        lerp(lerp(c(0,0,0), c(1,0,0), xf), lerp(c(0,1,0), c(1,1,0), xf), yf),
        lerp(lerp(c(0,0,1), c(1,0,1), xf), lerp(c(0,1,1), c(1,1,1), xf), yf),
        zf
      );
    };
  }

  _buildMeshes() {
    // Tre geometrie con carattere diverso: una scheggiata e spigolosa, una
    // tonda e bitorzoluta, una molto irregolare. Con una sola, la ripetizione
    // si nota dopo dieci secondi di gioco.
    const shapes = [
      { detail: 2, freq: 1.5, amp: 0.42, oct: 3, squash: [1.0, 0.72, 0.90] },
      { detail: 3, freq: 2.4, amp: 0.30, oct: 4, squash: [1.0, 0.94, 0.82] },
      { detail: 2, freq: 1.0, amp: 0.52, oct: 3, squash: [0.86, 1.0, 0.74] },
    ];
    const geos = shapes.map((S, v) => {
      const g = new THREE.IcosahedronGeometry(1, S.detail);
      const noise = this._noise3(1200 + v * 733);
      const p = g.attributes.position;
      const nv = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        nv.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        // fBm: ottave a frequenza doppia e ampiezza dimezzata. Le prime
        // danno le gobbe grandi, le ultime la scabrosità.
        let d = 0, f = S.freq, a = 1, norm = 0;
        for (let o = 0; o < S.oct; o++) {
          d += noise(nv.x * f + 11, nv.y * f + 23, nv.z * f + 37) * a;
          norm += a; f *= 2.05; a *= 0.5;
        }
        d /= norm;
        const r = 1 + d * S.amp;
        p.setXYZ(i, nv.x * r * S.squash[0], nv.y * r * S.squash[1], nv.z * r * S.squash[2]);
      }
      g.computeVertexNormals();
      return g;
    });
    this._variants = geos.length;

    // Superfici da SCANSIONE FOTOGRAMMETRICA di roccia vera (ambientCG, CC0):
    // colore, normali, rugosità e occlusione. Le mie texture disegnate su
    // canvas erano un'approssimazione; questi sono dati misurati da pietra
    // reale, e la differenza si vede tutta sui bordi e nei crateri.
    const tl = new THREE.TextureLoader();
    const load = (file, srgb, rep) => {
      const t = tl.load('./assets/tex/' + file);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.repeat.set(rep, rep);
      // l'occlusione userebbe di default un secondo set di coordinate UV che
      // le nostre geometrie non hanno: la rimando sul primo
      t.channel = 0;
      return t;
    };
    const set = (pref, rep) => ({
      map:          load(`${pref}_col.jpg`, true,  rep),
      normalMap:    load(`${pref}_nrm.jpg`, false, rep),
      roughnessMap: load(`${pref}_rgh.jpg`, false, rep),
      aoMap:        load(`${pref}_ao.jpg`,  false, rep),
    });
    // la terza variante riusa la prima con una scala diversa: cambia la grana
    // percepita senza costare un altro download
    const surf = [set('rock_a', 1), set('rock_b', 1), set('rock_a', 2.4)];

    const out = [];
    for (let f = 0; f < FAMILY.length; f++) {
      const F = FAMILY[f];
      out[f] = [];
      for (let v = 0; v < this._variants; v++) {
        const s = surf[v];
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,            // il colore vero arriva da instanceColor
          roughness: F.rough, metalness: F.metal,
          emissive: F.emissive, emissiveIntensity: F.ei,
          flatShading: false,         // le normal map fanno il lavoro meglio
          map: s.map, roughnessMap: s.roughnessMap,
          normalMap: s.normalMap, aoMap: s.aoMap, aoMapIntensity: 1.0,
          normalScale: new THREE.Vector2(1.4, 1.4),
        });
        const im = new THREE.InstancedMesh(geos[v], mat, CAPACITY);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = true;      // le rocce proiettano ombra…
        im.receiveShadow = true;   // …e la ricevono l'una dall'altra
        this.scene.add(im);
        out[f][v] = im;
      }
    }
    return out;
  }

  _pickFamily(r) {
    const x = r();
    let acc = 0;
    for (let i = 0; i < FAMILY.length; i++) {
      acc += FAMILY[i].weight;
      if (x < acc) return i;
    }
    return 0;
  }

  _makeRock(rnd, pos, scaleOverride) {
    const fam = this._pickFamily(rnd);
    const F = FAMILY[fam];
    // distribuzione a potenza: molti sassi, pochi massi enormi
    const scale = scaleOverride ?? (1.5 + Math.pow(rnd(), 2.4) * 15);
    const j = 1 - F.spread * 0.5 + rnd() * F.spread;
    const c = new THREE.Color(F.base).multiplyScalar(j);
    return {
      pos, scale,
      radius: scale * 1.02,
      family: fam,
      variant: Math.floor(rnd() * 3),
      color: c,
      axis: new THREE.Vector3(rnd()*2-1, rnd()*2-1, rnd()*2-1).normalize(),
      spin: (rnd()*2-1) * 0.5,
      angle: rnd() * Math.PI * 2,
      hp: scale >= ROCK.bigThreshold ? ROCK.hpBig : ROCK.hpSmall,
      vel: null,
    };
  }

  _makeChunk(cx, cy, cz, key) {
    const rnd = rngFrom(hash3(cx, cy, cz));
    const n = PER_MIN + Math.floor(rnd() * (PER_MAX - PER_MIN + 1));
    const list = [];
    for (let i = 0; i < n; i++) {
      const id = key + ':' + i;
      const pos = new THREE.Vector3(
        (cx + rnd()) * CHUNK, (cy + rnd()) * CHUNK, (cz + rnd()) * CHUNK
      );
      const r = this._makeRock(rnd, pos);
      r.id = id;
      // salta le rocce già distrutte: se il settore si ricarica non tornano
      if (this.dead.has(id)) continue;
      // niente rocce dentro (o conficcate nel bordo di) un pianeta
      if (this.planets && this.planets.contains(pos, r.radius + 40)) continue;
      list.push(r);
    }
    return list;
  }

  update(playerPos, dt) {
    const cx = Math.floor(playerPos.x / CHUNK);
    const cy = Math.floor(playerPos.y / CHUNK);
    const cz = Math.floor(playerPos.z / CHUNK);

    for (let x = cx-RADIUS; x <= cx+RADIUS; x++)
    for (let y = cy-RADIUS; y <= cy+RADIUS; y++)
    for (let z = cz-RADIUS; z <= cz+RADIUS; z++) {
      const k = x + ',' + y + ',' + z;
      if (!this.chunks.has(k)) this.chunks.set(k, this._makeChunk(x, y, z, k));
    }
    for (const k of this.chunks.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x-cx) > RADIUS+1 || Math.abs(y-cy) > RADIUS+1 || Math.abs(z-cz) > RADIUS+1)
        this.chunks.delete(k);
    }

    // i frammenti liberi si allontanano e scadono
    for (let i = this.free.length - 1; i >= 0; i--) {
      const r = this.free[i];
      r.pos.addScaledVector(r.vel, dt);
      r.ttl -= dt;
      if (r.ttl <= 0 || r.pos.distanceTo(playerPos) > 1400) this.free.splice(i, 1);
    }

    // riempi le istanze
    const counts = FAMILY.map(() => new Array(this._variants).fill(0));
    this.rocks.length = 0;

    const push = (r) => {
      r.angle += r.spin * dt;
      const im = this.meshes[r.family][r.variant];
      const i = counts[r.family][r.variant];
      if (i >= CAPACITY) return;
      this._q.setFromAxisAngle(r.axis, r.angle);
      this._s.setScalar(r.scale);
      this._m.compose(r.pos, this._q, this._s);
      im.setMatrixAt(i, this._m);
      im.setColorAt(i, r.color);
      counts[r.family][r.variant]++;
      this.rocks.push(r);
    };

    for (const list of this.chunks.values()) for (const r of list) push(r);
    for (const r of this.free) push(r);

    for (let f = 0; f < FAMILY.length; f++) for (let v = 0; v < this._variants; v++) {
      const im = this.meshes[f][v];
      im.count = counts[f][v];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }

    this.activeRocks  = this.rocks.length;
    this.activeChunks = this.chunks.size;
  }

  // Prima roccia che interseca la sfera data
  hitTest(pos, radius) {
    for (const r of this.rocks) {
      if (pos.distanceTo(r.pos) < r.radius + radius) return r;
    }
    return null;
  }

  // Danneggia una roccia. Ritorna 'destroyed' | 'hit'
  damage(rock, impactPos) {
    rock.hp--;
    const F = FAMILY[rock.family];
    if (rock.hp > 0) {
      this.debris.burst(impactPos, 12, {
        speed: 20, size: 0.42, life: 0.35,
        color: new THREE.Color(F.base).multiplyScalar(2.2),
        color2: new THREE.Color(0xffd9a0)
      });
      return 'hit';
    }
    this._destroy(rock);
    return 'destroyed';
  }

  _destroy(rock) {
    const F = FAMILY[rock.family];
    const big = rock.scale >= ROCK.bigThreshold;
    const n = Math.round(30 + rock.scale * 7);

    this.debris.burst(rock.pos, n, {
      speed: 16 + rock.scale * 2.6, size: 0.4 + rock.scale * 0.09,
      life: 0.9 + rock.scale * 0.06, drag: 0.75,
      color: new THREE.Color(F.base).multiplyScalar(2.6),
      color2: new THREE.Color(rock.family === 2 ? 0xff9a40 : rock.family === 1 ? 0xbfe8ff : 0xffcf9a)
    });
    if (this.audio) this.audio.explosion(Math.min(2.2, 0.5 + rock.scale * 0.12));

    // i massi si spezzano in frammenti che schizzano via
    if (big) {
      const rnd = rngFrom((Math.abs(rock.pos.x * 977 + rock.pos.z * 31) | 0) >>> 0);
      for (let i = 0; i < ROCK.fragments; i++) {
        const dir = new THREE.Vector3(rnd()*2-1, rnd()*2-1, rnd()*2-1).normalize();
        const f = this._makeRock(rnd, rock.pos.clone().addScaledVector(dir, rock.scale * 0.5),
                                 rock.scale * (0.30 + rnd() * 0.18));
        f.family = rock.family;
        f.color = rock.color.clone();
        f.hp = ROCK.hpSmall;
        f.vel = dir.multiplyScalar(12 + rnd() * 22);
        f.ttl = 26;
        f.id = null;
        this.free.push(f);
      }
    }

    // rimuovi dalla struttura di appartenenza
    if (rock.id) {
      this.dead.add(rock.id);
      for (const [k, list] of this.chunks) {
        const i = list.indexOf(rock);
        if (i >= 0) { list.splice(i, 1); break; }
      }
    } else {
      const i = this.free.indexOf(rock);
      if (i >= 0) this.free.splice(i, 1);
    }
  }

  reset() {
    this.chunks.clear();
    this.free.length = 0;
    this.dead.clear();
  }
}
