---
name: smw-rom-analysis
description: Verify Super Mario World ROM identity and analyze original 65C816/SNES behavior against this project's browser port.
---

# Analisi ROM di Super Mario World

Usa questa skill quando una risposta dipende dalla cartuccia originale: revisione della ROM, codice 65C816, viewport SNES, scrolling, piattaforme, collisioni o input. Per un controllo limitato al browser usa `smw-level-playtest`.

## Confini delle evidenze

- Tieni distinti i dati della ROM, il disassemblato statico, il replay nell’emulatore e il port browser. Una cattura REA del browser dimostra cosa fa il port, non cosa fa la cartuccia.
- Prima di usare indirizzi o simboli di una revisione, identifica il dump. Estensione, nome del file e 512 byte extra sono indizi, non una verifica della revisione.
- Non forzare la ROM SNES come 6502. Se REA non offre un provider 65C816/LoROM adatto, registra il limite e usa soltanto un percorso emulatore realmente disponibile, attribuendogli la propria evidenza.

## Flusso

1. Definisci il comportamento da verificare, il livello/stanza, la revisione e gli input. Leggi prima `tools/rom/README.md` e il codice del progetto pertinente.
2. Verifica il dump prima di interpretare indirizzi. Per la cartuccia supportata dal progetto usa `tools/rom/cartridge.mjs`: verifica SHA-256 e checksum, riconosce il payload europeo E1 atteso e gestisce il prefisso copier solo per la dimensione conosciuta. Per una ROM diversa, esegui una verifica SNES adatta a mappa, header e checksum; non riutilizzare l’etichetta E1.
3. Scegli la fonte in base alla domanda: SMWDisX per codice e simboli specifici della revisione; DiztinGUIsh per disassemblaggio contestuale e trace/code-data log; MesenCE per debugging runtime SNES; i probe `tools/rom` e `tools/reference` per replay deterministici quando il core Snes9x previsto è configurato. Dettagli e limiti sono in [rom-workflow.md](references/rom-workflow.md).
4. Per confrontare cartuccia e port, usa lo stesso livello, stato iniziale, standard video, sequenza input e frame. Misura separatamente posizione del giocatore, scroll PPU/camera e coordinate delle piattaforme.
5. Riporta digest e revisione verificata, strumenti e modalità, frame/input osservati, evidenza e limiti. Se un passaggio non è supportato, dichiaralo senza presentarlo come analisi ROM completata.
