// ════════════════════════════════════════════════════════════════════
//  INPUT — tastiera + mirino a inseguimento
//  Niente pointer lock: il cursore muove un mirino e la nave ci punta.
//  È lo schema di Elite/Everspace, più perdonante e non "cattura" il mouse.
// ════════════════════════════════════════════════════════════════════
export class Input {
  constructor() {
    this.up = false; this.down = false;
    this.rollL = false; this.rollR = false;
    this.boost = false;
    this.fire = false;

    // posizione grezza del cursore, in pixel
    this.mx = innerWidth / 2;
    this.my = innerHeight / 2;
    // scostamento normalizzato -1..1, con zona morta al centro
    this.aim = { x: 0, y: 0 };
    this.deadzone = 0.045;
    this.onKey = null;   // callback per i tasti singoli (es. C)

    addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; });
    addEventListener('mousedown', e => { if (e.button === 0) this.fire = true; });
    addEventListener('mouseup',   e => { if (e.button === 0) this.fire = false; });
    addEventListener('blur', () => this._releaseAll());

    addEventListener('keydown', e => this._key(e, true));
    addEventListener('keyup',   e => this._key(e, false));
  }

  _releaseAll() {
    this.up = this.down = this.rollL = this.rollR = this.boost = this.fire = false;
  }

  _key(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.up = down; break;
      case 'KeyS': case 'ArrowDown':  this.down = down; break;
      case 'KeyQ':                    this.rollL = down; break;
      case 'KeyE':                    this.rollR = down; break;
      case 'ShiftLeft': case 'ShiftRight': this.boost = down; break;
      case 'Space':                   this.fire = down; e.preventDefault(); break;
      default:
        if (down && this.onKey) this.onKey(e.code);
        return;
    }
    e.preventDefault();
  }

  update() {
    // normalizza sul lato più corto, così la sensibilità non dipende
    // dal formato della finestra
    const half = Math.min(innerWidth, innerHeight) / 2;
    let ax = (this.mx - innerWidth / 2)  / half;
    let ay = (this.my - innerHeight / 2) / half;

    const apply = (v) => {
      const s = Math.sign(v), a = Math.abs(v);
      if (a < this.deadzone) return 0;
      // Curva a esponente 1.55 invece di 2: al quadrato i movimenti piccoli
      // sparivano quasi del tutto e la nave sembrava non rispondere. Così
      // resta precisa al centro ma si muove davvero.
      const n = Math.min(1, (a - this.deadzone) / (1 - this.deadzone));
      return s * Math.pow(n, 1.55);
    };
    this.aim.x = apply(ax);
    this.aim.y = apply(ay);
    return this.aim;
  }
}
