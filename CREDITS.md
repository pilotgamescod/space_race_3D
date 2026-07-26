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

Mappe usate: colore (`_col`), normali (`_nrm`), rugosità (`_rgh`),
occlusione ambientale (`_ao`). Scaricate a 1K, ridimensionate e ricompresse
in JPEG per il web; le mappe di displacement e le normali in convenzione
DirectX sono state scartate perché non utilizzate.

## Generato proceduralmente (nessun file esterno)

- Pannellature, rivetti, usura e relative normal map dello scafo — `js/textures.js`
- Superficie e atmosfera dei pianeti — `js/render.js`
- Campo stellare, nebulose, mappa d'ambiente HDR — `js/render.js`
- Geometria degli asteroidi (rumore fBm a più ottave) — `js/field.js`
- Navicelle del giocatore e nemiche — `js/ship.js`, `js/enemies.js`
- Tutto l'audio, sintetizzato in Web Audio — `js/audio.js`

## Nota

Progetto personale, senza scopo di lucro. Se un giorno dovesse diventare
commerciale, tutto quanto sopra è già compatibile: MIT e CC0 non pongono
restrizioni d'uso commerciale.
