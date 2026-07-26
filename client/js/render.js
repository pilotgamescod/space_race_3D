// ════════════════════════════════════════════════════════════════════
//  RENDER — WebGL2 via Three.js
//  Scena, illuminazione, cielo, pianeta e catena di post-processing.
//  Direzione artistica: sci-fi realistico. Una stella lontana come unica
//  luce forte, riempimento quasi nullo, nero profondo, bloom sobrio.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass }        from 'three/addons/postprocessing/BokehPass.js';
import { FilmPass }         from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass }         from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass }         from 'three/addons/postprocessing/SMAAPass.js';

export const FOV_BASE  = 64;
export const FOV_BOOST = 82;

export class Renderer {
  constructor() {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    // ACES + esposizione: è ciò che dà l'aria "girata con una macchina da presa"
    // invece di "disegnata". Senza tone mapping gli emissivi bruciano piatti.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV_BASE, innerWidth / innerHeight, 0.35, 40000);

    // Nebbia lineare tarata SOLO sul raggio degli asteroidi: le rocce
    // svaniscono nel nero invece di comparire dal nulla ai bordi del campo
    // generato. Cielo, nebulose e pianeta la ignorano (fog: false), altrimenti
    // sparirebbero: sono a diecimila unità di distanza.
    this.scene.fog = new THREE.Fog(0x05070c, 540, 1150);

    this._buildLights();
    this._buildEnvironment();
    this._buildSky();
    this._buildPlanet();
    this._buildComposer();

    addEventListener('resize', () => this.resize());
  }

  // ─── luci ───────────────────────────────────────────────────────
  _buildLights() {
    // La stella: direzionale, bianca leggermente calda, molto intensa.
    this.star = new THREE.DirectionalLight(0xfff2e0, 2.9);
    this.starDir = new THREE.Vector3(-0.45, 0.32, 0.83).normalize();
    this.star.position.copy(this.starDir).multiplyScalar(1000);
    this.scene.add(this.star);
    this.scene.add(this.star.target);

    // ── ombre ──
    // Una sorgente di luce senza ombre lascia gli oggetti "appiccicati" sopra
    // lo sfondo. Il tronco di vista dell'ombra è volutamente STRETTO e segue
    // la nave (vedi updateShadow): coprire tutto il campo di asteroidi con una
    // sola mappa darebbe ombre sgranate e inutili.
    this.star.castShadow = true;
    this.star.shadow.mapSize.set(2048, 2048);
    const S = 95;
    const sc = this.star.shadow.camera;
    sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S;
    sc.near = 1; sc.far = 900;
    this.star.shadow.bias = -0.0006;
    this.star.shadow.normalBias = 0.04;   // evita l'acne d'ombra sulle rocce
    sc.updateProjectionMatrix();

    // Riempimento minimo, freddo: nello spazio la luce di rimbalzo è quasi
    // nulla, ma a zero le facce in ombra diventano nero assoluto e la forma
    // 3D si perde. Questo è il compromesso che tiene leggibile la silhouette.
    this.fill = new THREE.HemisphereLight(0x2a4a7a, 0x05070c, 0.34);
    this.scene.add(this.fill);
  }

  // ─── environment map ────────────────────────────────────────────
  // Senza questa, tutti i materiali con metalness alta risultano quasi NERI:
  // un metallo non ha un colore proprio, riflette l'ambiente, e se l'ambiente
  // non esiste non riflette nulla. È l'errore PBR più comune. Genero una
  // mappa equirettangolare procedurale (fondo freddo + la stella calda) e la
  // passo per PMREM, che la trasforma nella mappa sfocata per i riflessi.
  _buildEnvironment() {
    // Generata come DataTexture a VIRGOLA MOBILE, non su canvas.
    // È la differenza decisiva: un canvas è a 8 bit, quindi il valore massimo
    // è 1 e la "stella" non è realmente più luminosa di una parete bianca.
    // In HDR la stella vale centinaia, e i metalli hanno finalmente qualcosa
    // di brillante da riflettere — è da lì che nasce il riflesso speculare.
    const W = 256, H = 128;
    const data = new Float32Array(W * H * 4);
    const d = this.star.position.clone().normalize();
    const dir = new THREE.Vector3();

    // nebulose in coordinate direzionali, per tingere i riflessi
    const clouds = [
      { dir: new THREE.Vector3( 0.7, 0.25, -0.6).normalize(), col: [0.030, 0.055, 0.130], w: 0.9 },
      { dir: new THREE.Vector3(-0.6, -0.1,  0.75).normalize(), col: [0.075, 0.030, 0.095], w: 1.1 },
      { dir: new THREE.Vector3( 0.1, -0.8, -0.3).normalize(), col: [0.020, 0.060, 0.070], w: 1.3 },
    ];

    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      const dy = Math.sin((0.5 - v) * Math.PI);
      const c = Math.sqrt(Math.max(0, 1 - dy * dy));
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        const phi = (u - 0.5) * Math.PI * 2;
        dir.set(c * Math.sin(phi), dy, -c * Math.cos(phi));

        // fondo: appena più chiaro verso l'alto, quasi nero sotto
        let r = 0.0045 + dy * 0.006;
        let g = 0.0075 + dy * 0.009;
        let b = 0.0170 + dy * 0.016;

        for (const n of clouds) {
          const t = Math.max(0, dir.dot(n.dir));
          const f = Math.pow(t, 2.2) * n.w;
          r += n.col[0] * f; g += n.col[1] * f; b += n.col[2] * f;
        }

        // la stella: disco stretto molto intenso più un alone largo tenue
        const ang = Math.acos(Math.min(1, Math.max(-1, dir.dot(d))));
        const disc = ang < 0.035 ? 420 : 0;
        const halo = 26 * Math.exp(-(ang * ang) / 0.010) + 1.5 * Math.exp(-(ang * ang) / 0.22);
        const s = disc + halo;
        r += s * 1.00; g += s * 0.955; b += s * 0.880;   // bianco leggermente caldo

        const i = (y * W + x) * 4;
        data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 1;
      }
    }

    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.envMap = pmrem.fromEquirectangular(tex).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 1.0;
    pmrem.dispose();
    tex.dispose();
  }

  // ─── cielo: campo stellare + nebulose ───────────────────────────
  _buildSky() {
    const R = 16000, N = 7000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const c = new THREE.Color();

    for (let i = 0; i < N; i++) {
      // distribuzione uniforme sulla sfera
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i*3]   = Math.cos(t) * s * R;
      pos[i*3+1] = u * R;
      pos[i*3+2] = Math.sin(t) * s * R;

      // temperature stellari realistiche: molte rosse/gialle, poche azzurre
      const r = Math.random();
      const hue  = r < 0.62 ? 0.09 + Math.random() * 0.06     // arancio/giallo
                 : r < 0.88 ? 0.13 + Math.random() * 0.04     // bianco caldo
                            : 0.58 + Math.random() * 0.05;    // azzurro
      const sat  = r < 0.88 ? 0.28 + Math.random() * 0.3 : 0.45;
      c.setHSL(hue, sat, 0.62 + Math.random() * 0.32);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;

      // pochissime stelle grosse, tante piccole
      siz[i] = Math.pow(Math.random(), 4.2) * 2.7 + 0.45;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize',    new THREE.BufferAttribute(siz, 1));

    // Shader minimo: dimensione per-stella e bordo morbido. Con i punti
    // di default le stelle sono quadrati duri e si vede subito.
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: innerHeight / 2 } },
      vertexShader: `
        attribute float aSize;
        varying vec3 vC;
        uniform float uScale;
        void main() {
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * (uScale / 900.0);
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.15, d);
          gl_FragColor = vec4(vC * a, a);
        }`,
      vertexColors: true
    });

    // Cielo e nebulose stanno in un gruppo unico che ogni frame viene
    // riportato sulla camera: così restano infinitamente lontani senza
    // sommare spostamenti frame per frame (che accumulava errore numerico).
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    this.stars = new THREE.Points(g, m);
    this.stars.frustumCulled = false;
    this.skyGroup.add(this.stars);

    // Nebulose: sprite additivi enormi e tenui. Danno profondità di colore
    // al fondo senza costare nulla.
    const tex = this._nebulaTexture();
    const tints = [0x3355aa, 0x7a3f8f, 0x1f6b7a, 0x8a4a33];
    this.nebulae = [];
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: tints[i], transparent: true, opacity: 0.19,
        // depthTest DEVE restare attivo: con depthTest:false le nebulose
        // venivano disegnate sopra qualunque cosa, scafo compreso, e in
        // cabina sembrava un bagliore che accecava lo schermo.
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false
      }));
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u), r = R * 0.72;
      sp.position.set(Math.cos(t)*s*r, u*r*0.55, Math.sin(t)*s*r);
      sp.scale.setScalar(6500 + Math.random() * 5000);
      this.skyGroup.add(sp);
      this.nebulae.push(sp);
    }
  }

  _nebulaTexture() {
    const S = 256, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const x = cv.getContext('2d');
    // più macchie sfumate sovrapposte: una sola sfumatura sembra un cerchio
    for (let i = 0; i < 22; i++) {
      const px = Math.random() * S, py = Math.random() * S;
      const pr = (0.10 + Math.random() * 0.30) * S;
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.09})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    }
    // dissolvenza ai bordi, così il quadrato dello sprite non si vede
    const v = x.createRadialGradient(S/2, S/2, S*0.18, S/2, S/2, S*0.5);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = v; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ─── pianeta lontano, per dare scala ────────────────────────────
  _buildPlanet() {
    const R = 1400;
    this.planet = new THREE.Group();
    this.planet.position.set(-5200, -900, -8600);

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshStandardMaterial({
        color: 0x6b5a4a, roughness: 0.92, metalness: 0.0,
        map: this._planetTexture(), fog: false
      })
    );
    this.planet.add(body);

    // Atmosfera: guscio con fresnel. È il dettaglio che fa leggere la
    // sfera come un mondo invece che come una palla texturizzata.
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uLight: { value: this.star.position.clone().normalize() } },
        vertexShader: `
          varying vec3 vN; varying vec3 vW;
          void main() {
            vN = normalize(normalMatrix * normal);
            vW = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader: `
          varying vec3 vN; varying vec3 vW;
          uniform vec3 uLight;
          void main() {
            float fres = pow(1.0 - abs(dot(vN, vW)), 2.6);
            float lit  = max(dot(normalize(vN), normalize(uLight)), 0.0);
            vec3  col  = mix(vec3(0.18,0.36,0.72), vec3(0.62,0.78,1.0), lit);
            gl_FragColor = vec4(col * fres * (0.30 + lit * 0.95), fres * 0.85);
          }`
      })
    );
    this.planet.add(atmo);
    this.scene.add(this.planet);
  }

  _planetTexture() {
    const W = 1024, H = 512, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#4e4238'; x.fillRect(0, 0, W, H);
    // fasce latitudinali + macchie: legge come un mondo roccioso/desertico
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * H, h = 6 + Math.random() * 46;
      x.fillStyle = `rgba(${120+Math.random()*70|0},${95+Math.random()*55|0},${72+Math.random()*45|0},${0.10+Math.random()*0.18})`;
      x.fillRect(0, y, W, h);
    }
    for (let i = 0; i < 700; i++) {
      const r = 2 + Math.random() * 24;
      x.beginPath();
      x.arc(Math.random()*W, Math.random()*H, r, 0, Math.PI*2);
      x.fillStyle = `rgba(${40+Math.random()*130|0},${34+Math.random()*100|0},${28+Math.random()*80|0},${0.05+Math.random()*0.16})`;
      x.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }

  // ─── post-processing ────────────────────────────────────────────
  _buildComposer() {
    const size = new THREE.Vector2(innerWidth, innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Occlusione ambientale: scurisce gli incavi e i punti di contatto fra
    // superfici. È ciò che smette di far sembrare gli oggetti incollati sopra
    // lo sfondo e dà volume alle fessure fra i pannelli e nei crateri.
    this.gtao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.updateGtaoMaterial({
      radius: 0.55, distanceExponent: 1.4, thickness: 1.2,
      scale: 1.0, samples: 12, screenSpaceRadius: false,
    });
    this.gtao.blendIntensity = 0.85;
    this.composer.addPass(this.gtao);

    // ATTENZIONE alla soglia: agisce sui valori HDR LINEARI, prima del tone
    // mapping — non su quello che vedi a schermo. Lo scafo illuminato vale
    // ~1.5 in lineare pur apparendo grigio medio, quindi con soglia 0.96
    // brillava e produceva un bagliore che accecava. Sopra 2 restano fuori
    // le superfici illuminate e dentro solo ciò che emette luce davvero.
    this.bloom = new UnrealBloomPass(size, 0.55, 0.60, 3.2);
    this.composer.addPass(this.bloom);

    // Profondità di campo, spenta per scelta: rende molto ma raddoppia il
    // costo perché rifà un passaggio di profondità sull'intera scena.
    // La messa a fuoco la aggiorno ogni frame sulla distanza REALE della nave
    // (setFocus). Era fissa a 34 unità mentre la nave sta a ~10: sfocava il
    // soggetto invece del fondo, e sembrava un guasto del gioco.
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 10, aperture: 0.00026, maxblur: 0.005 });
    this.bokeh.enabled = false;
    this.composer.addPass(this.bokeh);

    // Grana pellicola tenuta bassissima: appena rompe la pulizia digitale.
    this.composer.addPass(new FilmPass(0.14));
    this.composer.addPass(new OutputPass());

    // SMAA in coda, dopo la conversione a sRGB: l'antialiasing va fatto sui
    // valori finali, altrimenti i bordi ad alto contrasto restano scalettati
    // nonostante l'antialiasing del contesto WebGL.
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
  }

  toggleDof() { this.bokeh.enabled = !this.bokeh.enabled; return this.bokeh.enabled; }
  toggleAo()  { this.gtao.enabled  = !this.gtao.enabled;  return this.gtao.enabled; }

  // Mette a fuoco il soggetto, così la sfocatura tocca solo il fondo.
  setFocus(dist) {
    if (!this.bokeh.enabled) return;
    const u = this.bokeh.uniforms['focus'];
    u.value += (dist - u.value) * 0.1;   // inseguimento morbido, come un obiettivo
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.gtao) this.gtao.setSize(w, h);
    this.stars.material.uniforms.uScale.value = h / 2;
  }

  // Il cielo segue la camera: così resta infinitamente lontano e non ci
  // si "avvicina" mai, che è l'errore classico dei fondali stellati.
  syncSky() {
    this.skyGroup.position.copy(this.camera.position);
  }

  // La mappa d'ombra segue il giocatore: la luce resta a distanza fissa nella
  // sua direzione e punta sempre dove sei tu, così i 2048 pixel della mappa
  // sono spesi tutti sulla porzione di spazio che stai guardando.
  updateShadow(target) {
    this.star.target.position.copy(target);
    this.star.position.copy(this.starDir).multiplyScalar(420).add(target);
    this.star.target.updateMatrixWorld();
  }

  // EffectComposer chiama render() una volta per passaggio, e ogni chiamata
  // azzera le statistiche: leggendole dopo si otteneva sempre 1 (il quad
  // dell'ultimo passaggio). Azzero a mano e lascio accumulare.
  render() {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.composer.render();
  }

  get info() { return this.renderer.info.render; }
}
