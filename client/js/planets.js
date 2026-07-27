// ════════════════════════════════════════════════════════════════════
//  PLANETS — corpi planetari veri, enormi, e SOLIDI
//
//  Sei pianeti sparsi nel settore, con texture fotografiche (Solar System
//  Scope, CC-BY 4.0 — vedi CREDITS.md). Non sono scenografia: hanno una
//  superficie. Avvicinarsi troppo fa scattare l'allarme di prossimità,
//  toccarla distrugge la navicella. Niente più "attraversare il pianeta
//  e non capire cosa è successo": ora ti schianti, come è giusto.
//
//  La scala è la chiave della sensazione di grandezza: raggi da 1100 a
//  4600 unità (la nave è lunga 8). Avvicinandosi, un gigante gassoso
//  riempie il cielo da solo.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

// margine oltre la superficie a cui la nave "tocca" il pianeta
const CRASH_MARGIN = 14;
// quota (dalla superficie) sotto cui parte l'allarme di prossimità
export const WARN_ALTITUDE = 900;

const DEFS = [
  {
    name: 'Vesta', tex: '2k_moon.jpg', radius: 1100,
    pos: [2600, -500, -5600], tilt: 0.1, spin: 0.006,
    // mondo morto senza atmosfera: niente alone
    atmo: null,
  },
  {
    name: 'Rubra', tex: '2k_mars.jpg', radius: 1900,
    pos: [-9500, 1500, 4800], tilt: 0.35, spin: 0.005,
    atmo: { color: [0.85, 0.45, 0.28], thin: true },
  },
  {
    name: 'Boreas', tex: '2k_neptune.jpg', radius: 2700,
    // nell'emisfero opposto a Vesta e Gorgon: tre pianeti sulla stessa
    // rotta di partenza affollavano il cielo iniziale
    pos: [14000, -2800, 13000], tilt: 0.5, spin: 0.010,
    atmo: { color: [0.30, 0.50, 1.0] },
  },
  {
    name: 'Gorgon', tex: '2k_jupiter.jpg', radius: 4600,
    // non in linea col buco nero visto dall'origine: sovrapposti sembravano
    // un adesivo incollato sul pianeta
    pos: [-2500, -6500, -23000], tilt: 0.15, spin: 0.012,
    atmo: { color: [0.75, 0.60, 0.42] },
  },
  {
    name: 'Aureo', tex: '2k_saturn.jpg', radius: 3200,
    pos: [17500, 3800, 9500], tilt: 0.45, spin: 0.011,
    atmo: { color: [0.80, 0.70, 0.48] },
    ring: { tex: '2k_saturn_ring_alpha.png', inner: 1.24, outer: 2.32 },
  },
  {
    name: 'Cinera', tex: '2k_venus_atmosphere.jpg', radius: 1600,
    pos: [4500, 5600, 11500], tilt: 0.05, spin: 0.004,
    atmo: { color: [0.95, 0.82, 0.55], thick: true },
  },
];

// alone atmosferico: guscio con fresnel, colorato per pianeta.
// BackSide + additivo: si vede solo il bordo, come un'atmosfera vera.
function atmoMaterial(starDir, col, opts = {}) {
  const power = opts.thin ? 3.4 : opts.thick ? 2.0 : 2.6;
  const gain  = opts.thin ? 0.55 : opts.thick ? 1.25 : 0.9;
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uLight: { value: starDir.clone() },
      uColor: { value: new THREE.Vector3(...col) },
      uPower: { value: power },
      uGain:  { value: gain },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vW;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vW = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vW;
      uniform vec3 uLight; uniform vec3 uColor;
      uniform float uPower; uniform float uGain;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vW))), uPower);
        float lit  = max(dot(normalize(vN), normalize(uLight)), 0.0);
        // il bordo illuminato brilla, quello in ombra quasi sparisce:
        // e' cio' che fa leggere da che parte sta il sole
        vec3 col = mix(uColor * 0.5, uColor * 1.35, lit);
        gl_FragColor = vec4(col * fres * (0.16 + lit) * uGain, fres);
      }`
  });
}

export class Planets {
  constructor(scene, starDir) {
    this.list = [];
    this.nearest = null;        // { planet, altitude } del frame corrente
    const tl = new THREE.TextureLoader();

    for (const D of DEFS) {
      const g = new THREE.Group();
      g.position.set(...D.pos);

      const tex = tl.load('./assets/tex/planets/' + D.tex);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      // La geometria è densa perché da vicino il pianeta riempie lo schermo:
      // con pochi segmenti si vedrebbe il bordo a spigoli.
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(D.radius, 128, 96),
        new THREE.MeshStandardMaterial({
          map: tex, roughness: 0.96, metalness: 0.0, fog: false,
        })
      );
      body.rotation.z = D.tilt;
      g.add(body);

      if (D.atmo) {
        const scale = D.atmo.thick ? 1.045 : 1.03;
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(D.radius * scale, 96, 72),
          atmoMaterial(starDir, D.atmo.color, D.atmo)
        );
        g.add(atmo);
      }

      if (D.ring) {
        const rtex = tl.load('./assets/tex/planets/' + D.ring.tex);
        rtex.colorSpace = THREE.SRGBColorSpace;
        rtex.anisotropy = 8;
        const inner = D.radius * D.ring.inner, outer = D.radius * D.ring.outer;
        const rg = new THREE.RingGeometry(inner, outer, 192, 1);
        // La texture dell'anello è una striscia radiale: la U deve seguire
        // il raggio, non l'angolo. RingGeometry di suo mappa la UV sul
        // piano, che stirerebbe la striscia in un'unica sbavatura.
        const uv = rg.attributes.uv, p = rg.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < uv.count; i++) {
          v.set(p.getX(i), p.getY(i), 0);
          uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
        }
        const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
          map: rtex, transparent: true, side: THREE.DoubleSide,
          depthWrite: false, fog: false,
          // MeshBasic perché l'anello è ghiaccio sottile retroilluminato:
          // con lo standard risultava nero sul lato in ombra
          color: 0xcfc4ae, opacity: 0.9,
        }));
        ring.rotation.x = Math.PI / 2;
        ring.rotation.y = D.tilt;
        g.add(ring);
      }

      scene.add(g);
      this.list.push({
        name: D.name, pos: g.position, radius: D.radius,
        group: g, body, spin: D.spin,
      });
    }
  }

  update(dt) {
    for (const p of this.list) p.body.rotation.y += p.spin * dt;
  }

  /** Pianeta più vicino e quota dalla superficie. Aggiorna this.nearest. */
  probe(shipPos) {
    let best = null, bestAlt = Infinity;
    for (const p of this.list) {
      const alt = shipPos.distanceTo(p.pos) - p.radius;
      if (alt < bestAlt) { bestAlt = alt; best = p; }
    }
    this.nearest = { planet: best, altitude: bestAlt };
    return this.nearest;
  }

  /** true se la posizione è dentro la superficie (= schianto) */
  crashed(shipPos) {
    const n = this.probe(shipPos);
    return n.altitude < CRASH_MARGIN ? n.planet : null;
  }

  /** vero se un punto sta dentro un pianeta: usato dal campo di asteroidi
   *  per non far nascere rocce dentro la superficie */
  contains(pos, margin = 0) {
    for (const p of this.list) {
      if (pos.distanceTo(p.pos) < p.radius + margin) return true;
    }
    return false;
  }
}
