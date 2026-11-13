# Procedura per la ROM di Super Mario World

## 1. Identificare il dump

Preserva il file originale. Raccogli percorso, dimensione e SHA-256 grezzo. Un file SNES può avere un prefisso copier da 512 byte; la condizione `dimensione modulo 1024 = 512` lo rende candidato, ma da sola non dimostra che i byte siano un header copier né identifica il gioco o la revisione.

Per una candidata SNES, individua il vero header interno in base alla mappa: LoROM inizia a offset `0x7FC0`, HiROM a `0xFFC0`, ExHiROM a `0x40FFC0`; con prefisso copier gli offset aumentano di `0x200`. Valida campi plausibili, modalità di mapping, dimensione dichiarata, regione, versione, reset vector, checksum e complemento. Calcola il checksum sul payload della cartuccia, applicando le regole di mirroring SNES quando la dimensione non è una potenza di due. Conserva separati digest del file grezzo e del payload interpretato.

### Identità supportata dal progetto

Il repository supporta il payload europeo E1 da 524.288 byte con SHA-256:

```text
5cc54b1e5c8d3c7701a5e20514145c3b36f15f26fe0a4fe6d2e43677e4b4eda9
```

`tools/rom/cartridge.mjs` è il controllo autoritativo locale per questo payload: rimuove 512 byte soltanto se il file misura esattamente 524.800 byte, poi verifica il digest atteso, la somma checksum e il complemento. Per validare senza rigenerare gli asset del progetto:

```sh
node --input-type=module -e 'import { Cartridge, expectedSha256 } from "./tools/rom/cartridge.mjs"; const c = new Cartridge(process.argv[1]); console.log(JSON.stringify({ payloadBytes: c.data.length, sha256: expectedSha256 }));' "/percorso/gioco.smc"
```

Un errore significa che quel file non è il payload E1 atteso da questo repository. Non correggerlo tagliando byte a tentativi e non applicare `SMW_E1.sym` a un dump non verificato. `node tools/rom/extract.mjs` rigenera `generated/`; usalo solo quando l’estrazione degli asset è necessaria, non per una semplice verifica d’identità.

## 2. Analisi statica 65C816

- Dopo la verifica del dump, usa la variante corrispondente di [SMWDisX](https://github.com/IsoFrieze/SMWDisX), i relativi simboli (`SMW_E1.sym`) e `differences.txt`. Il progetto dichiara supporto alle release J, U, E 1.0 ed E 1.1: scegli la revisione verificata, non quella che sembra più plausibile dal nome del file.
- Quando possibile, confronta l’assemblato con un dump della stessa revisione. Registra commit e versione degli strumenti usati.
- Per istruzioni e indirizzamento consulta la documentazione [WDC 65C816](https://www.wdc65xx.com/wdc/documentation/Assembler_Linker.pdf). Segui stato emulation/native, flag M/X che determinano la dimensione degli immediati, data bank e direct page: una decodifica senza contesto può desincronizzarsi e interpretare dati come codice.
- [DiztinGUIsh](https://github.com/DizTools/DiztinGUIsh) è utile per annotazioni, confini codice/dati, trace log e usage/CDL importati da emulatori supportati. La cattura live descritta dal progetto usa una build custom BSNES; verifica il formato effettivo del trace prima di importarlo.

## 3. Analisi runtime originale

Per osservare input, PPU, scrolling o piattaforme durante l’esecuzione usa [MesenCE](https://github.com/nesdev-org/MesenCE) con la revisione verificata e il suo debugger SNES, se disponibile nell’ambiente. Per sequenze ripetibili usa il core libretro Snes9x previsto dal progetto (`SNES9X_CORE`) e i probe in `tools/rom` o `tools/reference`. Non installare o scaricare emulatori/core senza richiesta esplicita.

Per ogni acquisizione annota:

- SHA-256 del payload e revisione;
- livello/stanza, punto iniziale, regione video e frame PAL/NTSC;
- input premuti e durata espressa in frame;
- coordinate mondo del giocatore, scroll verticale PPU (BG1/BG2 se separati), coordinate mondo/schermo della piattaforma;
- framebuffer nativo e frame esatti confrontati.

Per distinguere camera e movimento del giocatore, confronta una sequenza senza input con la stessa sequenza che tiene Su o Giù, mantenendo identici stato iniziale e durata. Registra anche Y del giocatore: se la camera cambia insieme alla sua posizione, non attribuire automaticamente lo spostamento al solo input; controlla funi, tubi, nuoto e controller di scrolling della stanza.

## 4. Confronto con il port browser

Usa `smw-level-playtest` per avviare la stanza tramite l’ID interno `testLevel`. Aspetta che `#screen canvas` sia visibile prima di acquisire: `#play` può apparire mentre il gioco mostra ancora il caricamento. Registra dimensioni intrinseche del canvas, screenshot e frame/input della sequenza.

Il framebuffer PAL di riferimento del progetto è 256×224 (`tools/reference/video.py` lo impone); confronta quell’area logica con un canvas browser di 256×224 prima di valutare lo scaling CSS. Se le proporzioni coincidono, indaga scroll, ritaglio della scena o meccanica della piattaforma invece di cambiare il rapporto del viewport.

Per il codice browser, `apps/web/src/game/start.ts` imposta il canvas Phaser a 256×224; `apps/web/src/game/terrain-view.ts` e `apps/web/src/game/world-scene.ts` determinano camera e rendering. Queste fonti spiegano il port, ma non sostituiscono l’acquisizione della cartuccia.

## 5. Uso di REA e attribuzione

Controlla a ogni sessione i provider e lo schema attuali di REA. Usa `open_binary` soltanto se la configurazione supporta davvero CPU 65C816 e mappatura SNES; non forzare 6502 per superare un rifiuto di formato. Usa gli strumenti browser REA solo per il port browser. Se l’ambiente offre un collegamento REA a MesenCE/altro emulatore, descrivi l’operazione come replay runtime e conserva il digest ROM nel contesto.

Limite osservato il 2026-11-13: l’autodetect REA rifiutava il file `.smc` come formato binario non supportato e lo schema `open_binary` non accettava `65c816`. Ricontrolla lo stato in futuro; non trattare questa osservazione come limite permanente del prodotto.

## Riferimenti

- [SMWDisX](https://github.com/IsoFrieze/SMWDisX) — disassemblato e varianti della release.
- [DiztinGUIsh](https://github.com/DizTools/DiztinGUIsh) — analisi 65C816, annotazioni, trace e code/data logs.
- [MesenCE](https://github.com/nesdev-org/MesenCE) e [releases](https://github.com/nesdev-org/MesenCE/releases) — emulatore SNES/debugger runtime.
- [SNESdev: ROM file formats](https://snes.nesdev.org/wiki/ROM_file_formats) e [ROM header](https://snes.nesdev.org/wiki/ROM_header) — copier header, mappature e checksum.
- [WDC Assembler/Linker](https://www.wdc65xx.com/wdc/documentation/Assembler_Linker.pdf) — sintassi e modalità del 65C816.
- File del progetto: `tools/rom/cartridge.mjs`, `tools/rom/README.md`, `tools/reference/video.py`, `tools/reference/core.py`, `apps/web/src/game/start.ts`, `apps/web/src/game/terrain-view.ts`.
