// ════════════════════════════════════════════════════════════════════
//  DEBRIS — particelle su GPU per esplosioni, scintille e scie
//  Un solo BufferGeometry con un pool fisso: le particelle morte vengono
//  riciclate. Nessuna allocazione durante il gioco, una sola draw call
//  per migliaia di particelle.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const MAX = 4000;

export class Debris {
  constructor(scene) {
    this.n = MAX;
    this.head = 0;

    // stato su CPU
    this.vel  = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max  = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);

    // attributi su GPU
    this.pos  = new Float32Array(MAX * 3);
    this.col  = new Float32Array(MAX * 3);
    this.siz  = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol',     new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize',    new THREE.BufferAttribute(this.siz, 1));
    g.setAttribute('aAlpha',   new THREE.BufferAttribute(this.alpha, 1));
    g.setDrawRange(0, MAX);
    this.geo = g;

    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: innerHeight } },
      vertexShader: `
        attribute vec3 aCol; attribute float aSize; attribute float aAlpha;
        varying vec3 vC; varying float vA;
        uniform float uScale;
        void main() {
          vC = aCol; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // dimensione in prospettiva: le scintille vicine sono grandi
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main() {
          if (vA <= 0.001) discard;
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vC, a * vA);
        }`
    });

    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // tutte spente all'avvio
    for (let i = 0; i < MAX; i++) { this.life[i] = 0; this.alpha[i] = 0; }
  }

  // Emette una raffica di particelle. col è un THREE.Color.
  burst(origin, count, opts = {}) {
    const speed  = opts.speed  ?? 26;
    const spread = opts.spread ?? 1;
    const size   = opts.size   ?? 0.7;
    const life   = opts.life   ?? 1.1;
    const col    = opts.color  ?? new THREE.Color(0xffc98a);
    const col2   = opts.color2 ?? null;
    const drag   = opts.drag   ?? 0.6;
    const inherit = opts.inherit ?? null;   // velocità da ereditare

    for (let k = 0; k < count; k++) {
      const i = this.head; this.head = (this.head + 1) % MAX;

      // direzione casuale uniforme sulla sfera
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = speed * (0.25 + Math.random() * 0.75) * spread;

      this.vel[i*3]   = Math.cos(t) * s * sp + (inherit ? inherit.x : 0);
      this.vel[i*3+1] = u * sp             + (inherit ? inherit.y : 0);
      this.vel[i*3+2] = Math.sin(t) * s * sp + (inherit ? inherit.z : 0);

      this.pos[i*3]   = origin.x;
      this.pos[i*3+1] = origin.y;
      this.pos[i*3+2] = origin.z;

      const c = (col2 && Math.random() < 0.45) ? col2 : col;
      // variazione di luminosità: un colore unico appiattisce l'esplosione
      const j = 0.72 + Math.random() * 0.56;
      this.col[i*3]   = c.r * j;
      this.col[i*3+1] = c.g * j;
      this.col[i*3+2] = c.b * j;

      this.siz[i]  = size * (0.45 + Math.random() * 1.1);
      this.max[i]  = life * (0.55 + Math.random() * 0.9);
      this.life[i] = this.max[i];
      this.drag[i] = drag;
      this.alpha[i] = 1;
    }
  }

  update(dt) {
    const { pos, vel, life, max, alpha, drag } = this;
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      const d = 1 - Math.min(1, drag[i] * dt);
      vel[i*3] *= d; vel[i*3+1] *= d; vel[i*3+2] *= d;
      pos[i*3]   += vel[i*3]   * dt;
      pos[i*3+1] += vel[i*3+1] * dt;
      pos[i*3+2] += vel[i*3+2] * dt;
      const f = life[i] / max[i];
      // dissolvenza quadratica: resta luminosa e poi svanisce in fretta
      alpha[i] = f * f;
      live++;
    }
    this.live = live;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aCol.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  resize() { this.mat.uniforms.uScale.value = innerHeight; }
}
