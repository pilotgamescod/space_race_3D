// ════════════════════════════════════════════════════════════════════
//  DUST — pulviscolo spaziale attorno alla navicella
//
//  Un cubo di particelle minute che avvolge sempre il giocatore: quando
//  una esce dal cubo, rientra dal lato opposto (wrap). Non si nota mai
//  il trucco, ma il parallasse ravvicinato che produce è ciò che dà la
//  SENSAZIONE di velocità: senza riferimenti vicini, nello spazio anche
//  a 300 u/s sembra di stare fermi.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const N = 900;        // particelle
const BOX = 260;      // lato del cubo che avvolge il giocatore

export class Dust {
  constructor(scene) {
    this.pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) this.pos[i] = (Math.random() - 0.5) * BOX;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = g;

    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uScale:   { value: innerHeight },
        // allungamento nella direzione del moto: a velocità alta le
        // particelle diventano brevi striature, come neve nei fari
        uStretch: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        uniform float uScale;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 3.4 * uScale / max(30.0, d) / 100.0 * 26.0;
          // dissolve sia vicinissimo (non "colpisce" la camera) sia al
          // bordo del cubo, dove avviene il wrap. Niente smoothstep con
          // i bordi invertiti: è comportamento non definito in GLSL.
          vA = smoothstep(4.0, 26.0, d) * (1.0 - smoothstep(${(BOX * 0.40).toFixed(1)}, ${(BOX * 0.62).toFixed(1)}, d));
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * vA * 0.5;
          gl_FragColor = vec4(vec3(0.75, 0.83, 0.95) * a, a);
        }`,
    });

    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._last = new THREE.Vector3();
  }

  /** center: posizione della camera/nave attorno a cui tenere il cubo */
  update(center) {
    const p = this.pos, h = BOX / 2;
    // wrap: ogni coordinata resta entro il cubo centrato sul giocatore
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? center.x : k === 1 ? center.y : center.z;
        let v = p[i*3+k];
        while (v < c - h) v += BOX;
        while (v > c + h) v -= BOX;
        p[i*3+k] = v;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  resize() { this.mat.uniforms.uScale.value = innerHeight; }
}
