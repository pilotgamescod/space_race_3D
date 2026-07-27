// ════════════════════════════════════════════════════════════════════
//  MODELS — caricamento dei modelli GLB delle navicelle
//
//  Valkyrie (giocatore) e Raider (sentinelle) vengono dal demo open
//  source "Space Pirates" del team Babylon.js — Apache 2.0, vedi
//  CREDITS.md e assets/models/LICENSE-SpacePirates.md. Sono scafi PBR
//  fatti da artisti veri: la differenza con le nostre primitive si vede.
//
//  Se il caricamento fallisce (file mancante, rete) si ritorna null e
//  il gioco ripiega sulle navicelle procedurali: mai schermo nero.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

function loadOne(url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => { console.warn('modello non caricato:', url, err); resolve(null); }
    );
  });
}

/** Prepara un modello: ombre, anisotropia, materiali pronti per la scena. */
function prep(root) {
  if (!root) return null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    if (!m) return;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
      if (m[k]) m[k].anisotropy = 8;
    }
    // il cielo procedurale è tenue: senza una spinta sull'ambiente i
    // metalli PBR del modello risultano più spenti che in Babylon
    m.envMapIntensity = 1.25;
  });
  return root;
}

/** Carica Valkyrie e Raider in parallelo. Ogni voce può essere null. */
export async function loadShipModels() {
  const [valkyrie, raider] = await Promise.all([
    loadOne('./assets/models/valkyrie.glb'),
    loadOne('./assets/models/raider.glb'),
  ]);
  return { valkyrie: prep(valkyrie), raider: prep(raider) };
}
