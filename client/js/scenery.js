// ════════════════════════════════════════════════════════════════════
//  SCENERY — gli elementi di scenario del mondo principale
//
//  Costellazioni, buco nero, galassia a spirale, nebulose lontane, sole.
//  Tutto ciò che sta molto oltre il campo di asteroidi e serve a dare
//  profondità e varietà al cielo: senza, lo spazio è nero e uguale ovunque.
//
//  Nulla di qui interagisce col gioco. Sono dietro, lontanissimi, e non
//  entrano nei calcoli di collisione.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// direzione casuale uniforme sulla sfera
function randDir(r) {
  const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(Math.cos(t) * s, u, Math.sin(t) * s);
}

export class Scenery {
  /** skyGroup segue la camera (infinitamente lontano); scene per gli oggetti
   *  che devono avere parallasse, cioè spostarsi mentre voli. */
  constructor(scene, skyGroup) {
    this.scene = scene;
    this.sky = skyGroup;
    this.spin = [];      // oggetti che ruotano lentamente

    this._constellations();
    this._galaxy();
    this._blackHole();
    this._distantSun();
    this._debrisBelt();
  }

  // ─── costellazioni ───────────────────────────────────────────────
  // Stelle più luminose collegate da linee tenui. È il dettaglio che fa
  // sembrare il cielo "un posto", con dei punti di riferimento, invece di
  // rumore bianco sparso a caso.
  _constellations() {
    const R = 15200;
    const r = rng(90210);
    const starPos = [], linePos = [];

    const NUM = 7;
    for (let c = 0; c < NUM; c++) {
      const centre = randDir(r);
      // base ortonormale attorno alla direzione della costellazione
      const up = Math.abs(centre.y) > 0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
      const ex = new THREE.Vector3().crossVectors(up, centre).normalize();
      const ey = new THREE.Vector3().crossVectors(centre, ex).normalize();

      const n = 5 + Math.floor(r() * 4);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.9;
        const rad = (0.05 + r() * 0.16);           // apertura angolare
        const d = centre.clone()
          .addScaledVector(ex, Math.cos(a) * rad)
          .addScaledVector(ey, Math.sin(a) * rad)
          .normalize().multiplyScalar(R);
        pts.push(d);
        starPos.push(d.x, d.y, d.z);
      }
      // le collego a catena, non tutte con tutte: sembra una figura
      for (let i = 0; i < pts.length - 1; i++) {
        linePos.push(pts[i].x, pts[i].y, pts[i].z);
        linePos.push(pts[i+1].x, pts[i+1].y, pts[i+1].z);
      }
      if (r() < 0.5) {   // qualcuna si chiude su sé stessa
        const a = pts[pts.length-1], b = pts[0];
        linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xcfe4ff, size: 5.2, sizeAttenuation: false,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    stars.frustumCulled = false;
    this.sky.add(stars);

    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      color: 0x5f86b8, transparent: true, opacity: 0.13,
      depthWrite: false, fog: false,
    }));
    lines.frustumCulled = false;
    this.sky.add(lines);
    this.constellationLines = lines;
  }

  // ─── galassia a spirale ──────────────────────────────────────────
  _galaxy() {
    const r = rng(4242);
    const N = 2600, ARMS = 2;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();

    for (let i = 0; i < N; i++) {
      const t = Math.pow(r(), 0.55);              // più densa al centro
      const arm = Math.floor(r() * ARMS);
      const ang = t * 5.2 + (arm / ARMS) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const rad = t * 1500;
      const thick = (1 - t) * 130 + 22;
      pos[i*3]   = Math.cos(ang) * rad + (r() - 0.5) * 90;
      pos[i*3+1] = (r() - 0.5) * thick;
      pos[i*3+2] = Math.sin(ang) * rad + (r() - 0.5) * 90;
      // nucleo caldo, bracci freddi: è così che si leggono le galassie vere
      c.setHSL(0.09 + t * 0.5, 0.55, 0.55 + (1 - t) * 0.35);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const gal = new THREE.Points(g, new THREE.PointsMaterial({
      size: 7, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    gal.frustumCulled = false;
    gal.position.set(9800, 3400, -11500);
    gal.rotation.set(0.9, 0.4, 0.25);
    this.sky.add(gal);

    // alone del nucleo
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._radialTex(0xffd9a0), color: 0xffd9a0,
      transparent: true, opacity: 0.42, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    halo.scale.setScalar(1700);
    halo.position.copy(gal.position);
    this.sky.add(halo);
  }

  // ─── buco nero ───────────────────────────────────────────────────
  // Sfera nera con disco di accrescimento. Sta nel MONDO, non nel cielo,
  // così scorre mentre voli e si capisce che è un posto reale e distante.
  _blackHole() {
    const G = new THREE.Group();
    G.position.set(-7200, 1500, -9000);

    // orizzonte degli eventi: nero assoluto, non riceve luce
    const hole = new THREE.Mesh(
      new THREE.SphereGeometry(230, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
    );
    G.add(hole);

    // anello di fotoni: sottile, molto luminoso, appena fuori dall'orizzonte
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(268, 6, 8, 128),
      new THREE.MeshBasicMaterial({
        color: 0xffe6c0, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    ring.material.color.multiplyScalar(4);   // in HDR, così il bloom lo prende
    G.add(ring);

    // disco di accrescimento: anelli concentrici a temperatura decrescente
    this.discs = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const inner = 300 + t * 520;
      const d = new THREE.Mesh(
        new THREE.RingGeometry(inner, inner + 90 + t * 60, 96, 1),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.09 - t * 0.05, 0.9, 0.62 - t * 0.22)
            .multiplyScalar(2.6 - t * 1.7),
          transparent: true, opacity: 0.55 - t * 0.05, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        })
      );
      d.rotation.x = Math.PI / 2;
      G.add(d);
      this.discs.push({ mesh: d, speed: 0.10 / (1 + t * 2.6) });   // rotazione differenziale
    }

    // il disco è inclinato rispetto a noi: visto di taglio sarebbe una riga
    G.rotation.set(0.55, 0.3, 0.15);
    this.scene.add(G);
    this.blackHole = G;
  }

  // ─── sole lontano ────────────────────────────────────────────────
  // Nella stessa direzione della luce direzionale: se la stella che illumina
  // la scena non si vede da nessuna parte, il cervello se ne accorge.
  _distantSun() {
    const dir = new THREE.Vector3(-0.45, 0.32, 0.83).normalize();
    const p = dir.multiplyScalar(14000);

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._radialTex(0xffffff), color: 0xfff4e0,
      transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    core.material.color.multiplyScalar(6);
    core.scale.setScalar(620);
    core.position.copy(p);
    this.sky.add(core);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._radialTex(0xffcf9a), color: 0xffcf9a,
      transparent: true, opacity: 0.34, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    halo.scale.setScalar(3200);
    halo.position.copy(p);
    this.sky.add(halo);
  }

  // ─── cintura di detriti lontana ──────────────────────────────────
  // Una fascia di puntini che attraversa il cielo: dà un orizzonte, un senso
  // di "piano" della galassia, e rompe la simmetria del nero.
  _debrisBelt() {
    const r = rng(777), N = 1800;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2;
      const rad = 11000 + r() * 3000;
      pos[i*3]   = Math.cos(a) * rad;
      pos[i*3+1] = (r() - 0.5) * 900;
      pos[i*3+2] = Math.sin(a) * rad;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const belt = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9fb4c8, size: 2.2, sizeAttenuation: false,
      transparent: true, opacity: 0.30, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    belt.frustumCulled = false;
    belt.rotation.set(0.28, 0, 0.16);
    this.sky.add(belt);
  }

  _radialTex(hex) {
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.16)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  update(dt) {
    // rotazione differenziale del disco: gli anelli interni girano più veloci,
    // come in un disco di accrescimento vero
    for (const d of this.discs) d.mesh.rotation.z += d.speed * dt;
  }
}
