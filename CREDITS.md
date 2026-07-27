# Crediti e licenze

## Il gioco

Codice scritto da zero. Nessun contenuto di terze parti oltre a quanto elencato
sotto. Nessun asset, nome, design o marchio proveniente da opere protette da
copyright (film, videogiochi, franchise).

## Libreria

**Three.js** 0.185.1 — licenza MIT
https://github.com/mrdoob/three.js
Copia in `client/vendor/three/` (core + addons di post-processing e loader).

## Texture

**ambientCG** — licenza **CC0 1.0** (pubblico dominio, nessuna attribuzione
richiesta; la indichiamo comunque per correttezza)
https://ambientcg.com

| File in `client/assets/tex/` | Origine | Uso |
|---|---|---|
| `rock_a_*.jpg` | Rock064 (fotogrammetria) | superficie asteroidi, variante 1 e 3 |
| `rock_b_*.jpg` | Rock063 (fotogrammetria) | superficie asteroidi, variante 2 |

**Solar System Scope** — licenza **CC BY 4.0** (attribuzione richiesta,
uso non commerciale e commerciale consentito)
https://www.solarsystemscope.com/textures/
Basate su dati e immagini NASA.

| File in `client/assets/tex/planets/` | Uso |
|---|---|
| `2k_moon.jpg` | pianeta Vesta |
| `2k_mars.jpg` | pianeta Rubra |
| `2k_neptune.jpg` | pianeta Boreas |
| `2k_jupiter.jpg` | pianeta Gorgon |
| `2k_saturn.jpg`, `2k_saturn_ring_alpha.png` | pianeta Aureo e anelli |
| `2k_venus_atmosphere.jpg` | pianeta Cinera |

Mappe usate: colore (`_col`), normali (`_nrm`), rugosità (`_rgh`),
occlusione ambientale (`_ao`). Scaricate a 1K, ridimensionate e ricompresse
in JPEG per il web; le mappe di displacement e le normali in convenzione
DirectX sono state scartate perché non utilizzate.

## Modelli 3D

**Space Pirates (Babylon.js)** — licenza **Apache 2.0**
https://github.com/BabylonJS/SpacePirates
Demo ufficiale del team Babylon.js per la release 5.0. Copia della
licenza in `client/assets/models/LICENSE-SpacePirates.md`.

| File in `client/assets/models/` | Uso |
|---|---|
| `valkyrie.glb` | navicella del giocatore |
| `raider.glb` | sentinelle nemiche |

Gli scafi procedurali originali (`js/ship.js`, `js/enemies.js`) restano
come ripiego se i GLB non si caricano.

## Generato proceduralmente (nessun file esterno)

- Pannellature, rivetti, usura e relative normal map dello scafo — `js/textures.js`
- Atmosfere dei pianeti (shader fresnel) — `js/planets.js`
- Campo stellare, nebulose, via lattea, mappa d'ambiente HDR, lens flare — `js/render.js`, `js/scenery.js`
- Geometria degli asteroidi (rumore fBm a più ottave) — `js/field.js`
- Navicelle del giocatore e nemiche — `js/ship.js`, `js/enemies.js`
- Tutto l'audio, effetti e musica ambient generativa in Web Audio — `js/audio.js`

## Nota

Progetto personale, senza scopo di lucro. Se un giorno dovesse diventare
commerciale, tutto quanto sopra è già compatibile: MIT e CC0 non pongono
restrizioni d'uso commerciale.
