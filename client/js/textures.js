// ════════════════════════════════════════════════════════════════════
//  TEXTURES — generatore procedurale di superfici tecniche
//
//  È qui che si guadagna la maggior parte del "dettaglio" percepito.
//  Un mezzo spaziale sembra complesso per le linee di pannello, i rivetti,
//  le variazioni di lamiera e l'usura — non perché ha più poligoni.
//  Nessun file esterno: tutto disegnato su canvas al primo avvio.
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

/**
 * Ricava una normal map da un canvas in scala di grigi trattato come altezza.
 *
 * È il pezzo che mancava: colore e rugosità danno la tinta, ma il RILIEVO
 * (una linea di pannello incisa che cattura la luce, un cratere con l'ombra
 * dentro) viene solo dalle normali. Senza, ogni superficie resta piatta
 * qualunque texture le metti sopra.
 *
 * Calcola la pendenza col metodo di Sobel e la codifica in RGB.
 */
export function normalFromHeight(srcCanvas, strength = 2.2) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;

  // luminanza in un array a parte: leggerla dai pixel dentro il ciclo
  // sarebbe molto più lento
  const H = new Float32Array(w * h);
  for (let i = 0, p = 0; i < H.length; i++, p += 4) {
    H[i] = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255;
  }

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const dst = out.getContext('2d');
  const img = dst.createImageData(w, h);
  const d = img.data;

  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];   // avvolgente

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel su X e Y
      const tl = at(x-1, y-1), t = at(x, y-1), tr = at(x+1, y-1);
      const l  = at(x-1, y),                   r  = at(x+1, y);
      const bl = at(x-1, y+1), b = at(x, y+1), br = at(x+1, y+1);
      const dx = (tr + 2*r + br) - (tl + 2*l + bl);
      const dy = (bl + 2*b + br) - (tl + 2*t + tr);

      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;

      const i = (y * w + x) * 4;
      d[i]     = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  dst.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Suddivide ricorsivamente un rettangolo in pannelli irregolari.
function splitPanels(list, x, y, w, h, depth, r) {
  if (depth <= 0 || (w < 42 && h < 42)) { list.push([x, y, w, h]); return; }
  const horiz = w > h ? r() < 0.78 : r() < 0.22;
  const f = 0.32 + r() * 0.36;
  if (horiz) {
    const cut = Math.round(w * f);
    splitPanels(list, x, y, cut, h, depth - 1, r);
    splitPanels(list, x + cut, y, w - cut, h, depth - 1, r);
  } else {
    const cut = Math.round(h * f);
    splitPanels(list, x, y, w, cut, depth - 1, r);
    splitPanels(list, x, y + cut, w, h - cut, depth - 1, r);
  }
}

/**
 * Genera colore + rugosità per una lamiera tecnica.
 * Il colore è quasi bianco: il tono vero lo dà `color` del materiale, così
 * la stessa texture serve per scafo, piastre e nemici.
 */
export function panelSet(seed = 7, size = 1024, opts = {}) {
  const rivets  = opts.rivets  ?? true;
  const wear    = opts.wear    ?? 0.5;
  const density = opts.density ?? 6;   // profondità di suddivisione

  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const rv = document.createElement('canvas'); rv.width = rv.height = size;
  const v = rv.getContext('2d');
  // canvas di ALTEZZA, separato dal colore: qui vanno solo le forme che
  // devono avere rilievo (solchi, rivetti, botole), non le variazioni di
  // tinta della lamiera — altrimenti si otterrebbero gobbe inesistenti.
  const hv = document.createElement('canvas'); hv.width = hv.height = size;
  const hc = hv.getContext('2d');

  const r = rng(seed);

  c.fillStyle = '#d8dade'; c.fillRect(0, 0, size, size);
  v.fillStyle = '#8a8a8a'; v.fillRect(0, 0, size, size);   // rugosità media
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, size, size); // altezza neutra

  const panels = [];
  splitPanels(panels, 0, 0, size, size, density, r);

  for (const [x, y, w, h] of panels) {
    // ogni lamiera ha una tinta appena diversa: è ciò che rompe l'uniformità
    const t = 0.86 + r() * 0.20;
    const g = Math.round(216 * t);
    c.fillStyle = `rgb(${g},${g + 2},${g + 6})`;
    c.fillRect(x, y, w, h);

    // rugosità: lamiere leggermente diverse fra loro
    const q = Math.round(120 + r() * 70);
    v.fillStyle = `rgb(${q},${q},${q})`;
    v.fillRect(x, y, w, h);

    // linea di pannello incisa: scura sul colore, liscia sulla rugosità
    c.strokeStyle = 'rgba(30,34,40,0.55)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    v.strokeStyle = 'rgba(210,210,210,0.7)';
    v.lineWidth = 1.5;
    v.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // il solco è INCASSATO: scuro sulla mappa di altezza
    hc.strokeStyle = 'rgba(46,46,46,0.9)';
    hc.lineWidth = 1.6;
    hc.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // qualche pannello ha un bordo chiaro: sembra una piastra sovrapposta
    if (r() < 0.22) {
      c.strokeStyle = 'rgba(255,255,255,0.30)';
      c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }

    // rivetti lungo il bordo lungo
    if (rivets && r() < 0.45 && Math.min(w, h) > 26) {
      const step = 13, along = w > h;
      const n = Math.floor((along ? w : h) / step);
      for (let i = 1; i < n; i++) {
        const px = along ? x + i * step : x + 5;
        const py = along ? y + 5 : y + i * step;
        c.fillStyle = 'rgba(40,44,50,0.5)';
        c.beginPath(); c.arc(px, py, 1.1, 0, 6.283); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.beginPath(); c.arc(px - 0.4, py - 0.4, 0.7, 0, 6.283); c.fill();
        // il rivetto SPORGE: chiaro sulla mappa di altezza
        hc.fillStyle = 'rgba(190,190,190,0.95)';
        hc.beginPath(); hc.arc(px, py, 1.4, 0, 6.283); hc.fill();
      }
    }

    // botole e sportelli tecnici
    if (r() < 0.12 && w > 46 && h > 46) {
      const hw = w * 0.42, hh = h * 0.42;
      c.fillStyle = 'rgba(24,28,34,0.55)';
      c.fillRect(x + (w - hw) / 2, y + (h - hh) / 2, hw, hh);
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.strokeRect(x + (w - hw) / 2, y + (h - hh) / 2, hw, hh);
      // la botola è incassata
      hc.fillStyle = 'rgba(96,96,96,0.9)';
      hc.fillRect(x + (w - hw) / 2, y + (h - hh) / 2, hw, hh);
    }
  }

  // usura: striature nel senso del flusso d'aria, molto tenui
  const streaks = Math.round(wear * 46);
  for (let i = 0; i < streaks; i++) {
    const x = r() * size, y = r() * size;
    const len = 30 + r() * 190, wd = 1 + r() * 3.5;
    const g = c.createLinearGradient(x, y, x + len, y);
    g.addColorStop(0, 'rgba(60,58,54,0)');
    g.addColorStop(0.4, `rgba(60,58,54,${0.05 + r() * 0.10})`);
    g.addColorStop(1, 'rgba(60,58,54,0)');
    c.fillStyle = g; c.fillRect(x, y, len, wd);
  }

  // graffi chiari: pochissimi, ma danno l'idea di superficie vissuta
  for (let i = 0; i < Math.round(wear * 16); i++) {
    c.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.09})`;
    c.lineWidth = 0.8;
    c.beginPath();
    const x = r() * size, y = r() * size;
    c.moveTo(x, y);
    c.lineTo(x + (r() - 0.5) * 130, y + (r() - 0.5) * 40);
    c.stroke();
  }

  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return {
    map: mk(cv, true),
    roughnessMap: mk(rv, false),
    normalMap: normalFromHeight(hv, 2.6),
  };
}

/**
 * Superficie rocciosa: crateri, screziature, grana. Le meteore senza texture
 * leggono come poliedri di plastica, per bella che sia la loro silhouette.
 */
export function rockSet(seed = 3, size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const rv = document.createElement('canvas'); rv.width = rv.height = size;
  const v = rv.getContext('2d');
  const hv = document.createElement('canvas'); hv.width = hv.height = size;
  const hc = hv.getContext('2d');
  const r = rng(seed);

  c.fillStyle = '#cfcac2'; c.fillRect(0, 0, size, size);
  v.fillStyle = '#c8c8c8'; v.fillRect(0, 0, size, size);
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, size, size);

  // gobbe e conche larghe sulla mappa di altezza: danno al sasso una
  // superficie mossa anche dove non ci sono crateri
  for (let i = 0; i < 110; i++) {
    const x = r() * size, y = r() * size, rr = 18 + r() * 110;
    const up = r() < 0.5;
    const g = hc.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, up ? 'rgba(220,220,220,0.30)' : 'rgba(40,40,40,0.30)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    hc.fillStyle = g; hc.beginPath(); hc.arc(x, y, rr, 0, 6.283); hc.fill();
  }

  // screziature larghe: variazione minerale
  for (let i = 0; i < 130; i++) {
    const x = r() * size, y = r() * size, rr = 12 + r() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    const tone = Math.round(150 + r() * 90);
    g.addColorStop(0, `rgba(${tone},${tone - 6},${tone - 14},${0.10 + r() * 0.22})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, 6.283); c.fill();
  }

  // crateri: bordo chiaro in alto, fondo scuro. Legge come concavo.
  for (let i = 0; i < 46; i++) {
    const x = r() * size, y = r() * size, rr = 5 + Math.pow(r(), 2) * 40;
    const g = c.createRadialGradient(x - rr * 0.25, y - rr * 0.25, 0, x, y, rr);
    g.addColorStop(0.00, 'rgba(40,36,32,0.42)');
    g.addColorStop(0.72, 'rgba(70,64,58,0.22)');
    g.addColorStop(0.92, 'rgba(255,250,240,0.30)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, 6.283); c.fill();
    // i crateri sono più lisci del terreno attorno
    const q = v.createRadialGradient(x, y, 0, x, y, rr);
    q.addColorStop(0, 'rgba(140,140,140,0.6)');
    q.addColorStop(1, 'rgba(0,0,0,0)');
    v.fillStyle = q; v.beginPath(); v.arc(x, y, rr, 0, 6.283); v.fill();

    // Il cratere sulla mappa di altezza: conca profonda con il bordo
    // rilevato. È questo che gli dà l'ombra dentro invece di sembrare
    // una macchia dipinta.
    const hgd = hc.createRadialGradient(x, y, 0, x, y, rr);
    hgd.addColorStop(0.00, 'rgba(26,26,26,0.85)');
    hgd.addColorStop(0.70, 'rgba(70,70,70,0.60)');
    hgd.addColorStop(0.90, 'rgba(225,225,225,0.75)');
    hgd.addColorStop(1.00, 'rgba(128,128,128,0)');
    hc.fillStyle = hgd; hc.beginPath(); hc.arc(x, y, rr, 0, 6.283); hc.fill();
  }

  // grana fine anche sull'altezza: ruvidità a scala millimetrica
  {
    const im = hc.getImageData(0, 0, size, size), dd = im.data;
    for (let i = 0; i < dd.length; i += 4) {
      const n = (r() - 0.5) * 40;
      dd[i] += n; dd[i + 1] += n; dd[i + 2] += n;
    }
    hc.putImageData(im, 0, 0);
  }

  // grana fine
  const img = c.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  c.putImageData(img, 0, 0);

  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return {
    map: mk(cv, true),
    roughnessMap: mk(rv, false),
    normalMap: normalFromHeight(hv, 3.4),   // roccia: rilievo marcato
  };
}

/** Griglia tecnica scura, per gondole motori e parti interne. */
export function techSet(seed = 21, size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const r = rng(seed);
  c.fillStyle = '#9aa0a8'; c.fillRect(0, 0, size, size);
  const step = size / 16;
  for (let i = 0; i <= 16; i++) {
    c.strokeStyle = 'rgba(20,24,30,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step, size); c.stroke();
    c.beginPath(); c.moveTo(0, i * step); c.lineTo(size, i * step); c.stroke();
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * 16) * step, y = Math.floor(r() * 16) * step;
    const g = Math.round(110 + r() * 90);
    c.fillStyle = `rgba(${g},${g + 4},${g + 10},0.85)`;
    c.fillRect(x + 1, y + 1, step - 2, step - 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Alone radiale morbido per gli sprite luminosi.
 *
 * Serve perché uno SpriteMaterial SENZA `map` disegna un quadrato pieno, non
 * un bagliore: era il rettangolo arancione che copriva le sentinelle.
 */
export function glowTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.20)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
