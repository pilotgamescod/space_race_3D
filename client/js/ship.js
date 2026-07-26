// ════════════════════════════════════════════════════════════════════
//  SHIP — mesh della navicella e modello di volo arcade in terza persona
//  Convenzione: la nave punta lungo -Z locale (come la camera di Three).
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { panelSet, techSet } from './textures.js';

// ─── parametri di volo (le manopole del "come si sente") ───────────
export const FLY = {
  thrustMax:   62,    // accelerazione a potenza piena
  thrustBoost: 168,   // accelerazione con postbruciatore
  drag:        0.52,  // attrito: tiene il controllo arcade, non è realistico
  yawRate:     1.15,  // rad/s a cursore tutto a lato
  pitchRate:   1.00,
  rollRate:    2.10,
  bankFactor:  0.85,  // inclinazione automatica in virata (virata coordinata)
  turnSmooth:  6.2,   // quanto morbidamente inseguono i comandi
  afterMax:    100,   // capacità del postbruciatore
  afterBurn:   34,    // consumo al secondo
  afterRegen:  17,    // ricarica al secondo
  hullMax:     100,
};

// Modalità combattimento (vista dalla cabina): la nave diventa nettamente
// più agile e reattiva. È il senso della modalità — vedi meno, ma manovri
// molto meglio. In esplorazione vedi tutto ma sei più impastato.
export const COMBAT = {
  yaw:    1.85,   // moltiplicatori sulle velocità angolari
  pitch:  1.85,
  roll:   1.45,
  smooth: 1.55,   // insegue i comandi più svelto
  bank:   0.35,   // meno inclinazione automatica: la mira resta stabile
};

export class Ship {
  constructor() {
    this.group = new THREE.Group();
    this.pos   = new THREE.Vector3(0, 0, 0);
    this.quat  = new THREE.Quaternion();
    this.vel   = new THREE.Vector3();

    this.throttle = 0.35;
    this.after    = FLY.afterMax;
    this.hull     = FLY.hullMax;
    this.boosting = false;
    this.invuln   = 0;    // invulnerabilità dopo un colpo
    this.hitFlash = 0;
    this.combat   = false;  // true = vista dalla cabina, manovrabilità piena

    // velocità angolari correnti (inseguono i comandi con smorzamento)
    this._yaw = 0; this._pitch = 0; this._roll = 0;

    this._build();
  }

  _build() {
    // Materiali: scafo scuro opaco, piastre più chiare, dettagli lucidi,
    // vetro cabina, strisce e nuclei emissivi.
    // Lo scafo è VERNICIATO, non metallo nudo: metalness bassa, così risponde
    // alla luce diffusa della stella. Con metalness alta e nessun ambiente da
    // riflettere risultava una silhouette nera. Il metallo lucido lo tengo
    // solo sui dettagli piccoli, dove i riflessi speculari fanno effetto.
    // Le texture di pannellatura sono il grosso del dettaglio percepito:
    // linee incise, rivetti, lamiere di tono diverso, striature d'usura.
    const skin  = panelSet(11, 1024, { wear: 0.6, density: 6 });
    const skin2 = panelSet(29, 1024, { wear: 0.35, density: 7 });
    const tech  = techSet(41, 512);
    const rep = (s, u, v) => {
      const o = {};
      for (const k of ['map', 'roughnessMap', 'normalMap']) if (s[k]) {
        o[k] = s[k].clone(); o[k].needsUpdate = true; o[k].repeat.set(u, v);
      }
      return o;
    };

    const hull  = new THREE.MeshStandardMaterial({
      color: 0x69737f, roughness: 0.58, metalness: 0.24,
      normalScale: new THREE.Vector2(0.85, 0.85), ...rep(skin, 2, 2) });
    const plate = new THREE.MeshStandardMaterial({
      color: 0x7c8794, roughness: 0.46, metalness: 0.34,
      normalScale: new THREE.Vector2(0.7, 0.7), ...rep(skin2, 3, 3) });
    // Rugosità alzata da 0.28: a specchio, il riflesso della stella sui
    // bordi metallici raggiungeva valori HDR altissimi e il bloom lo
    // trasformava in un bagliore che copriva mezzo schermo.
    const trim  = new THREE.MeshStandardMaterial({
      color: 0x9aa4b0, roughness: 0.46, metalness: 0.72 });
    const dark  = new THREE.MeshStandardMaterial({
      color: 0x2b313a, roughness: 0.62, metalness: 0.32, map: tech });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x081624, roughness: 0.05, metalness: 0.25,
      transparent: true, opacity: 0.74
    });
    // accento arancio: nello spazio i mezzi reali hanno marcature ad alta
    // visibilità, ed è ciò che rompe il grigio-su-grigio
    const mark = new THREE.MeshStandardMaterial({ color: 0xc25a1e, roughness: 0.5, metalness: 0.4 });
    this.stripMat = new THREE.MeshStandardMaterial({
      color: 0x061018, emissive: 0x2ba8ff, emissiveIntensity: 1.9, roughness: 0.4, fog: false
    });
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e14, emissive: 0x36bfff, emissiveIntensity: 3.4,
      roughness: 0.4, metalness: 0.3, fog: false
    });

    const g = this.group;

    // ── fusoliera ──
    // I cilindri hanno l'asse su Y locale; con rotation.x = -90° l'asse va su Z
    // (avanti/indietro). Dopo quella rotazione: scale.x resta la larghezza,
    // scale.z diventa l'altezza. Schiaccio in verticale e allargo, altrimenti
    // la sezione è circolare e la nave legge come un tubo, non come un caccia.
    const midBody = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.70, 3.0, 7, 1), hull);
    midBody.rotation.x = -Math.PI / 2; midBody.rotation.z = Math.PI / 7;
    midBody.scale.set(1.3, 1, 0.68);
    midBody.position.z = 0.5;
    g.add(midBody);

    const foreBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 2.2, 7, 1), plate);
    foreBody.rotation.x = -Math.PI / 2; foreBody.rotation.z = Math.PI / 7;
    foreBody.scale.set(1.25, 1, 0.66);
    foreBody.position.z = -1.9;
    g.add(foreBody);

    // dorso rialzato: dà volume visto da dietro, che è la nostra inquadratura
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 2.6), plate);
    spine.position.set(0, 0.42, 0.9);
    g.add(spine);

    // muso
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.5, 7), trim);
    nose.rotation.x = -Math.PI / 2; nose.rotation.z = Math.PI / 7;
    nose.position.z = -3.65;
    g.add(nose);
    // punta sensore
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.65, 6), trim);
    tip.rotation.x = -Math.PI / 2; tip.position.z = -4.62;
    g.add(tip);

    // ── cabina ──
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.38, 22, 14, 0, Math.PI*2, 0, Math.PI/2), glass);
    canopy.position.set(0, 0.28, -1.5);
    canopy.scale.set(1, 0.78, 2.5);
    g.add(canopy);
    // telaio della cabina
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 5, 20, Math.PI), trim);
    frame.position.set(0, 0.28, -0.62); frame.rotation.y = Math.PI / 2;
    g.add(frame);
    // esposti: dalla vista in cabina vanno nascosti, altrimenti da due
    // centimetri occupano mezzo schermo
    this.canopy = canopy;
    this.frameArc = frame;

    // ── ali a delta con piloni e pinne ──
    // Il profilo si disegna nel piano XY della Shape, poi rotation.x = -90°
    // manda +Y locale su -Z mondo (in avanti) e l'estrusione su +Y (spessore
    // verticale). Quindi: X = apertura alare, Y = avanti. Con la rotazione
    // sbagliata le ali finivano su un piano diagonale e sembravano lame.
    // Apertura ridotta da 3.55 a 2.45: la prima versione era così larga
    // rispetto alla fusoliera che sembrava un aliante di carta.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.00,  0.80);   // radice, bordo d'attacco
    wingShape.lineTo(2.45, -0.75);   // punta, bordo d'attacco
    wingShape.lineTo(2.45, -1.70);   // punta, bordo d'uscita
    wingShape.lineTo(0.00, -1.95);   // radice, bordo d'uscita
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.30, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2
    });
    // Specchiando con scale negativa si invertono le normali: senza DoubleSide
    // l'ala di un lato diventa invisibile.
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x69737f, roughness: 0.58, metalness: 0.24, side: THREE.DoubleSide,
      normalScale: new THREE.Vector2(0.85, 0.85), ...rep(skin, 1, 1)
    });

    this.hardpoints = [];
    for (const s of [1, -1]) {
      // Diedro negativo: le punte scendono. Rompe la piattezza e dà
      // un'aria aggressiva invece che da aliante.
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.rotation.x = -Math.PI / 2;
      w.rotation.z = s * 0.13;
      w.scale.x = s;
      w.position.set(s * 0.30, -0.08, 0.45);
      g.add(w);

      // aletta d'estremità: dà un profilo verticale alla punta dell'ala
      const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.78, 0.95), plate);
      winglet.position.set(s * 2.72, 0.10, 0.95);
      winglet.rotation.z = s * 0.20;
      g.add(winglet);

      // Bordo d'attacco lucido. L'ala è a freccia: andando verso la punta si
      // arretra di 1.9 su 3.55, cioè ~0.49 rad. La barra segue quell'angolo.
      // L'ala arretra di 1.55 su 2.45 andando verso la punta: ~0.56 rad.
      const edge = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.13, 0.13), trim);
      edge.position.set(s * 1.55, -0.13, 0.42);
      edge.rotation.y = -s * 0.56;
      edge.rotation.z = s * 0.13;
      g.add(edge);

      // marcatura arancio ad alta visibilità sull'ala
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.30), mark);
      stripe.position.set(s * 1.30, 0.06, 0.78);
      stripe.rotation.y = -s * 0.56;
      g.add(stripe);

      // pilone d'arma sotto l'ala, con canna
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 1.0), dark);
      pylon.position.set(s * 1.45, -0.28, 0.15);
      g.add(pylon);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 2.0, 8), trim);
      barrel.rotation.x = -Math.PI / 2;
      barrel.position.set(s * 1.45, -0.30, -1.0);
      g.add(barrel);
      this.hardpoints.push(new THREE.Vector3(s * 1.45, -0.30, -2.0));

      // pinna verticale posteriore
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0); finShape.lineTo(1.15, 0.05);
      finShape.lineTo(1.0, 0.95); finShape.lineTo(0.05, 0.72);
      finShape.closePath();
      const fin = new THREE.Mesh(
        new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false }),
        plate
      );
      fin.rotation.y = Math.PI / 2;
      fin.position.set(s * 0.62, 0.18, 1.0);
      fin.scale.set(1, 1, 1);
      g.add(fin);

      // presa d'aria laterale
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.30, 1.1), dark);
      intake.position.set(s * 0.72, 0.06, -0.55);
      g.add(intake);

      // striscia emissiva lungo la fusoliera: il dettaglio che il bloom
      // trasforma in una linea di luce e fa leggere la nave come "accesa"
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 2.3), this.stripMat);
      strip.position.set(s * 0.60, 0.20, 0.35);
      g.add(strip);
    }

    // ── greeble: la minutaglia tecnica che dà scala all'occhio ──
    // Senza questi rilievi le superfici grandi sembrano plastica stampata,
    // e la nave non ha un riferimento per capire quanto è grande.
    const grnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

    // pannellature e scatole sul dorso
    for (let i = 0; i < 16; i++) {
      const bx = new THREE.Mesh(
        new THREE.BoxGeometry(0.07 + grnd() * 0.24, 0.04 + grnd() * 0.09, 0.10 + grnd() * 0.34),
        i % 4 === 0 ? trim : plate
      );
      bx.position.set((grnd() - 0.5) * 0.95, 0.58 + grnd() * 0.06, -0.9 + grnd() * 3.1);
      bx.rotation.y = (grnd() - 0.5) * 0.2;
      g.add(bx);
    }

    // scatole tecniche sotto la fusoliera
    for (let i = 0; i < 9; i++) {
      const bx = new THREE.Mesh(
        new THREE.BoxGeometry(0.10 + grnd() * 0.20, 0.05 + grnd() * 0.10, 0.14 + grnd() * 0.30),
        dark
      );
      bx.position.set((grnd() - 0.5) * 0.80, -0.44 - grnd() * 0.05, -0.7 + grnd() * 2.7);
      g.add(bx);
    }

    // condotti longitudinali sui fianchi
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 1.8 + grnd() * 0.9, 6),
          trim
        );
        pipe.rotation.x = -Math.PI / 2;
        pipe.position.set(s * (0.52 + i * 0.055), -0.16 - i * 0.10, 0.7 + grnd() * 0.5);
        g.add(pipe);
      }
    }

    // ── ugelli di manovra (RCS): a coppie sul muso e in coda ──
    for (const [px, py, pz, rx, rz] of [
      [ 0.34, 0.16, -2.9, 0, -Math.PI/2], [-0.34, 0.16, -2.9, 0, Math.PI/2],
      [ 0.00, 0.44, -2.9, -Math.PI/2, 0], [ 0.00,-0.30, -2.9, Math.PI/2, 0],
      [ 0.52, 0.10,  1.9, 0, -Math.PI/2], [-0.52, 0.10,  1.9, 0, Math.PI/2],
    ]) {
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.14, 8), dark);
      noz.position.set(px, py, pz);
      noz.rotation.set(rx, 0, rz);
      g.add(noz);
    }

    // ── antenna e pod sensori ──
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.15, 5), trim);
    mast.position.set(-0.20, 0.86, 1.35);
    mast.rotation.x = -0.22;
    g.add(mast);
    // materiale clonato: la parabola serve a doppia faccia, ma mutare `plate`
    // renderebbe doppia faccia OGNI piastra della nave
    const dishMat = plate.clone();
    dishMat.side = THREE.DoubleSide;
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), dishMat);
    dish.position.set(-0.20, 1.40, 1.24);
    dish.rotation.set(-1.1, 0.4, 0);
    g.add(dish);

    for (const s of [1, -1]) {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.44, 3, 8), dark);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(s * 0.56, 0.30, -1.05);
      g.add(pod);
      // lente del sensore, appena luminosa
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), this.stripMat);
      lens.position.set(s * 0.56, 0.30, -1.40);
      g.add(lens);
    }

    // ── gondole motori con anelli ──
    this.cores = [];
    this.flames = [];
    for (const s of [1, -1]) {
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.37, 2.3, 14), dark);
      nac.rotation.x = -Math.PI / 2;
      nac.position.set(s * 0.80, -0.06, 1.6);
      g.add(nac);

      // anelli di raffreddamento
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.035, 5, 18), trim);
        ring.rotation.y = 0;
        ring.position.set(s * 0.80, -0.06, 0.95 + i * 0.55);
        g.add(ring);
      }
      // ugello svasato
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.30, 0.5, 14, 1, true), plate);
      bell.rotation.x = -Math.PI / 2;
      bell.position.set(s * 0.80, -0.06, 2.9);
      bell.material.side = THREE.DoubleSide;
      g.add(bell);

      // nucleo emissivo: è ciò che il bloom trasforma in bagliore
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.28, 18), this.coreMat);
      core.position.set(s * 0.80, -0.06, 2.72);
      core.rotation.y = Math.PI;
      g.add(core);
      this.cores.push(core);

      // Fiammata: cono emissivo che si allunga con la potenza. Volutamente
      // sottile e poco opaca — additivo più bloom moltiplicano la luminosità,
      // e la prima versione era un lenzuolo bianco che cancellava la nave.
      const fl = new THREE.Mesh(
        new THREE.ConeGeometry(0.19, 1.9, 14, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x4ec4f5, transparent: true, opacity: 0.30, fog: false,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      fl.rotation.x = Math.PI / 2;
      fl.position.set(s * 0.80, -0.06, 3.15);
      g.add(fl);
      this.flames.push(fl);
    }

    // Luce dei motori: illumina davvero le rocce che passi vicino.
    // È il dettaglio che dice "questa scena ha luci reali".
    // La posizione conta: a z=2.6 la luce stava DENTRO la fusoliera e dalla
    // vista in cabina illuminava lo scafo dall'interno saturandolo di bianco.
    // Va dietro gli ugelli, fuori dallo scafo.
    this.engineLight = new THREE.PointLight(0x49c8ff, 0, 26, 2);
    this.engineLight.position.set(0, -0.06, 4.5);
    g.add(this.engineLight);

    // ombre: ogni pezzo della nave proietta e riceve
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    g.position.copy(this.pos);
  }

  // ─── modello di volo ────────────────────────────────────────────
  // aim: {x,y} in -1..1, scostamento del cursore dal centro schermo
  update(dt, input, aim) {
    // in combattimento tutti i ratei salgono: è il vantaggio della modalità
    const C = this.combat ? COMBAT : { yaw: 1, pitch: 1, roll: 1, smooth: 1, bank: 1 };

    // comandi d'assetto desiderati
    const wantYaw   = -aim.x * FLY.yawRate   * C.yaw;
    const wantPitch = -aim.y * FLY.pitchRate * C.pitch;
    let   wantRoll  = (input.rollL ? 1 : 0) - (input.rollR ? 1 : 0);
    wantRoll *= FLY.rollRate * C.roll;
    // virata coordinata: inclina nella direzione in cui sta girando
    wantRoll += -wantYaw * FLY.bankFactor * C.bank;

    const k = 1 - Math.exp(-FLY.turnSmooth * C.smooth * dt);
    this._yaw   += (wantYaw   - this._yaw)   * k;
    this._pitch += (wantPitch - this._pitch) * k;
    this._roll  += (wantRoll  - this._roll)  * k;

    // rotazioni sugli assi LOCALI, così il volo è coerente in 3D
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._yaw   * dt); this.quat.multiply(q);
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this._pitch * dt); this.quat.multiply(q);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this._roll  * dt); this.quat.multiply(q);
    this.quat.normalize();

    // potenza
    if (input.up)   this.throttle = Math.min(1, this.throttle + dt * 0.9);
    if (input.down) this.throttle = Math.max(0, this.throttle - dt * 1.2);

    // postbruciatore
    this.boosting = input.boost && this.after > 1 && this.throttle > 0.05;
    if (this.boosting) this.after = Math.max(0, this.after - FLY.afterBurn * dt);
    else               this.after = Math.min(FLY.afterMax, this.after + FLY.afterRegen * dt);

    // spinta lungo -Z locale
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
    const acc = (this.boosting ? FLY.thrustBoost : FLY.thrustMax) * this.throttle;
    this.vel.addScaledVector(fwd, acc * dt);
    // attrito: senza questo in assenza di gravità si accumula velocità
    // all'infinito e il gioco diventa ingovernabile
    this.vel.multiplyScalar(1 - Math.min(1, FLY.drag * dt));

    this.pos.addScaledVector(this.vel, dt);

    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);

    if (this.invuln > 0)   this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3.2);

    this._updateEngines(dt);
  }

  _updateEngines(dt) {
    const lvl = this.throttle * (this.boosting ? 1 : 0.62);
    for (const fl of this.flames) {
      // la fiammata si allunga e si assottiglia: cresce in Z, non in volume
      fl.scale.set(0.85 + lvl * 0.3, 1, 0.35 + lvl * 1.5 + Math.random() * 0.10);
      fl.material.opacity = 0.10 + lvl * 0.30;
      fl.material.color.setHex(this.boosting ? 0x9adcff : 0x4ec4f5);
    }
    this.coreMat.emissiveIntensity = 2.4 + lvl * 5.5;   // sopra la soglia del bloom
    this.coreMat.emissive.setHex(this.boosting ? 0x9fe4ff : 0x36bfff);
    this.engineLight.intensity = lvl * (this.boosting ? 22 : 9);
    this.engineLight.color.setHex(this.boosting ? 0xaee6ff : 0x49c8ff);
    // le strisce di scafo seguono la potenza, più tenui dei motori
    this.stripMat.emissiveIntensity = 1.6 + lvl * 3.2;
    this.stripMat.emissive.setHex(this.boosting ? 0x8fd8ff : 0x2ba8ff);
  }

  // Danno allo scafo. Ritorna true se la nave è distrutta.
  damage(amount) {
    if (this.invuln > 0) return false;
    this.hull = Math.max(0, this.hull - amount);
    this.invuln = 0.7;
    this.hitFlash = 1;
    return this.hull <= 0;
  }

  // Riporta la nave allo stato di partenza (nuova partita)
  reset() {
    this.pos.set(0, 0, 0);
    this.quat.identity();
    this.vel.set(0, 0, 0);
    this.throttle = 0.35;
    this.after = FLY.afterMax;
    this.hull = FLY.hullMax;
    this.invuln = 0;
    this.hitFlash = 0;
    this._yaw = this._pitch = this._roll = 0;
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
  }

  get speed() { return this.vel.length(); }
  get forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat); }
  get up()      { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat); }
}
