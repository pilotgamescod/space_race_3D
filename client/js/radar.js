// ════════════════════════════════════════════════════════════════════
//  RADAR — schermo tattico
//
//  Proiezione dall'alto sul piano della navicella: avanti = su. Mostra
//  ostili, massi grandi e (in futuro) i compagni di squadra.
//
//  Il problema di un radar 2D in un gioco 3D è la quota: due bersagli
//  possono sovrapporsi sullo schermo pur essendo uno sopra e uno sotto.
//  Qui la quota è resa da un trattino verticale sotto ogni segnale — è
//  la soluzione classica, e si legge senza doverci pensare.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

export const RADAR = {
  range: 700,        // unità di gioco coperte dal bordo esterno
  size: 152,         // lato in pixel CSS
};

export class Radar {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.contacts = 0;      // ostili entro portata, per l'allarme
    this.nearest = Infinity;
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.cv.width  = RADAR.size * dpr;
    this.cv.height = RADAR.size * dpr;
    this.cv.style.width  = RADAR.size + 'px';
    this.cv.style.height = RADAR.size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param ship     la navicella del giocatore
   * @param enemies  array con .pos
   * @param rocks    array con .pos e .scale (mostro solo i massi grandi)
   * @param allies   array con .pos e .name — pronto per il multigiocatore
   */
  draw(ship, enemies, rocks, allies = []) {
    const c = this.ctx, S = RADAR.size, R = S / 2 - 6;
    c.clearRect(0, 0, S, S);

    // Fondo scuro: senza, lo strumento si perde quando davanti passa il muso
    // della navicella, che è chiaro e riflette la stella.
    const bg = c.createRadialGradient(S/2, S/2, 0, S/2, S/2, R);
    bg.addColorStop(0.00, 'rgba(4,8,14,0.82)');
    bg.addColorStop(0.80, 'rgba(4,8,14,0.74)');
    bg.addColorStop(1.00, 'rgba(4,8,14,0.30)');
    c.fillStyle = bg;
    c.beginPath(); c.arc(S/2, S/2, R, 0, 6.283); c.fill();

    // ── griglia ──
    c.strokeStyle = 'rgba(111,211,255,0.16)';
    c.lineWidth = 1;
    for (const f of [0.34, 0.67, 1]) {
      c.beginPath(); c.arc(S/2, S/2, R * f, 0, 6.283); c.stroke();
    }
    c.strokeStyle = 'rgba(111,211,255,0.10)';
    c.beginPath();
    c.moveTo(S/2, S/2 - R); c.lineTo(S/2, S/2 + R);
    c.moveTo(S/2 - R, S/2); c.lineTo(S/2 + R, S/2);
    c.stroke();

    // settore frontale: chiarisce dove stai puntando
    c.fillStyle = 'rgba(111,211,255,0.05)';
    c.beginPath();
    c.moveTo(S/2, S/2);
    c.arc(S/2, S/2, R, -Math.PI/2 - 0.52, -Math.PI/2 + 0.52);
    c.closePath(); c.fill();

    // ── la nave al centro ──
    c.fillStyle = 'rgba(232,238,245,0.9)';
    c.beginPath();
    c.moveTo(S/2, S/2 - 5); c.lineTo(S/2 - 3.5, S/2 + 4); c.lineTo(S/2 + 3.5, S/2 + 4);
    c.closePath(); c.fill();

    // inverso dell'orientamento: porta il mondo nel sistema della nave
    this._q.copy(ship.quat).invert();

    // proietta un punto del mondo sul quadrante; null se fuori portata
    const project = (pos) => {
      this._d.copy(pos).sub(ship.pos).applyQuaternion(this._q);
      const dist = Math.hypot(this._d.x, this._d.z);
      if (dist > RADAR.range) return null;
      const k = R / RADAR.range;
      // -z è avanti, e sullo schermo "avanti" deve andare in alto
      return { x: S/2 + this._d.x * k, y: S/2 + this._d.z * k, alt: this._d.y, d: dist };
    };

    // ── massi grandi: solo i più grossi, altrimenti è rumore ──
    c.fillStyle = 'rgba(150,160,172,0.32)';
    let shown = 0;
    for (const r of rocks) {
      if (r.scale < 10 || shown > 60) continue;
      const p = project(r.pos); if (!p) continue;
      const s = 1 + (r.scale - 10) * 0.10;
      c.beginPath(); c.arc(p.x, p.y, Math.min(3.2, s), 0, 6.283); c.fill();
      shown++;
    }

    // ── alleati (multigiocatore: la struttura è già pronta) ──
    for (const a of allies) {
      const p = project(a.pos); if (!p) continue;
      this._blip(c, p, '#5dffa0', 3.4);
      if (a.name) {
        c.fillStyle = 'rgba(93,255,160,0.75)';
        c.font = '8px ui-monospace, monospace';
        c.textAlign = 'center';
        c.fillText(a.name.slice(0, 8), p.x, p.y - 8);
      }
    }

    // ── ostili ──
    this.contacts = 0;
    this.nearest = Infinity;
    for (const e of enemies) {
      const p = project(e.pos); if (!p) continue;
      this.contacts++;
      if (p.d < this.nearest) this.nearest = p.d;
      // più vicino = più acceso
      const t = 1 - Math.min(1, p.d / RADAR.range);
      this._blip(c, p, '#ff5a3c', 2.6 + t * 2.2);
    }

    // ── bordo ──
    c.strokeStyle = 'rgba(232,238,245,0.20)';
    c.beginPath(); c.arc(S/2, S/2, R, 0, 6.283); c.stroke();
  }

  // segnale + trattino della quota
  _blip(c, p, color, size) {
    // linea verticale = differenza di quota rispetto a te
    const h = Math.max(-16, Math.min(16, p.alt * 0.045));
    if (Math.abs(h) > 1.5) {
      c.strokeStyle = color + '66';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - h); c.stroke();
    }
    c.fillStyle = color;
    c.beginPath(); c.arc(p.x, p.y - h, size, 0, 6.283); c.fill();
  }
}

/**
 * Punto di mira anticipato: dove sparare per colpire un bersaglio in
 * movimento, dato che il proiettile impiega un tempo ad arrivare.
 *
 * Senza questo, contro un nemico che si sposta di lato non si prende mai
 * nulla e sembra che i colpi attraversino il bersaglio.
 */
export function leadPoint(shooterPos, shooterVel, targetPos, targetVel, speed) {
  const rel = targetPos.clone().sub(shooterPos);
  const relV = targetVel.clone().sub(shooterVel);
  const a = relV.lengthSq() - speed * speed;
  const b = 2 * rel.dot(relV);
  const c = rel.lengthSq();

  let t;
  if (Math.abs(a) < 1e-4) {
    t = -c / b;                       // caso degenere: velocità quasi pari
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;        // il proiettile non raggiunge mai
    const s = Math.sqrt(disc);
    const t1 = (-b + s) / (2 * a), t2 = (-b - s) / (2 * a);
    t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  }
  if (!isFinite(t) || t < 0 || t > 4) return null;
  return targetPos.clone().addScaledVector(targetVel, t);
}
