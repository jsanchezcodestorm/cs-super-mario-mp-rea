# Lettura della cartuccia PAL

`node tools/rom/extract.mjs "/percorso/gioco.smc"` legge Super Mario World, edizione europea revisione 1. Servono Node.js 24 e un compilatore C invocabile con `cc` oppure indicato in `CC`. Il comando generale di estrazione del progetto richiama anche gli strumenti per personaggi, boss, mappa e audio.

Il payload LoROM di 524.288 byte ha SHA-256 `5cc54b1e5c8d3c7701a5e20514145c3b36f15f26fe0a4fe6d2e43677e4b4eda9`, SHA-1 `46bf36be1c3a2ce9de7581323370bd2d891ad5a1` e CRC32 `b47f5f20`. L'estrattore riconosce anche un header esterno da 512 byte. Verifica il digest, il checksum SNES e il suo complemento prima di eseguire il codice della cartuccia. La revisione è importante perché gli indirizzi di varie routine differiscono tra le edizioni.

## Livelli e grafica

Il banco 05 contiene 512 puntatori per ciascuno dei due layer e 512 puntatori alle liste degli sprite. Il caricatore di oggetti della cartuccia espande tubi, pendii, bordi, decorazioni e oggetti specifici dei tileset. Il piccolo bus in `machine.c` mette a disposizione ROM, WRAM, VRAM e DMA del canale 2. Esegue il caricatore, la composizione delle palette e 32 tick di animazione in locale. Il motore web legge le griglie Map16 e gli atlanti risultanti.

| Indirizzo SNES E1 | Dato o routine |
| --- | --- |
| `05:E000`, `05:E600`, `05:EC00` | Puntatori a layer 1, layer 2 e sprite |
| `05:F000`–`05:FFFF` | Header secondari e ingressi |
| `05:801E` | Espansione dei dati oggetto dei due layer in WRAM |
| `00:ABF4`, `00:A9E1` | Palette e caricamento dei caratteri in VRAM |
| `05:BB49`, `00:A397` | Selezione e trasferimento dei caratteri animati |
| `05:DB08`, `05:DB1A`, `05:DB2C` | Stanze condizionali di Chocolate Island 2 |
| `05:D766`, `05:D778` | Sei scene di ingresso dei castelli e delle case infestate |

La generazione produce `generated/content.json`, le 512 voci originali in `generated/rooms-index.json`, 52 banchi grafici decompressi e 79 atlanti. Le 246 scene comprendono 235 voci della directory con dati diversi dal livello di prova condiviso, cinque varianti condizionali e sei scene di ingresso. Gli alias presenti nella ROM conservano i propri ID. La geometria dei boss Mode 7 viene inizializzata dal codice di gioco.

Ogni atlante ha 32 colonne di celle da 16 pixel. Le prime 512 celle contengono il primo piano e le seconde 512 lo sfondo. `animatedTiles` associa una cella animata ai quattro indici dell'atlante. La struttura `background.scroll` descrive i rapporti di scorrimento della camera e lo scostamento iniziale per l'ingresso principale. Le scene ricevono anche i punti di ingresso, le uscite, le coordinate degli sprite, le palette, le impostazioni del timer, le griglie collisioni del secondo layer e le tabelle di movimento lette dalla ROM.

## Boss Mode 7

`boss_capture.py` avvia la ROM nel core libretro di riferimento, raggiunge il primo livello e percorre un'uscita diagnostica per entrare in ciascuna arena. Decodifica caratteri e tilemap Mode 7 da VRAM, sprite da OAM e colori da CGRAM. Isola gli elementi di scenario usando le opzioni dei layer di Snes9x. Il manifest in `generated/bosses/index.json` associa le stanze alle immagini dei sette boss che utilizzano queste arene, alle piattaforme oscillanti e alla ruota dei Reznor. Le immagini dei boss contengono due pose catturate.

## Risorse online

- I simboli E1 danno gli indirizzi SNES effettivi delle routine indicate nel disassemblato. [SMWDisX, simboli PAL revisione 1](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/SMW_E1.sym)
- Il banco 05 documenta puntatori, espansione dei livelli e animazione. Il banco 0D contiene le routine degli oggetti e le definizioni Map16. [Banco 05](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_05.asm) · [Banco 0D](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_0D.asm)
- L'estrattore incorpora la CPU 65C816 e il gestore di stato di LakeSnes. La licenza MIT è inclusa in `vendor/lakesnes/LICENSE.txt`. [Sorgenti di LakeSnes](https://github.com/angelo-wf/LakeSnes/tree/9db90b86e46a377609305e298dd92d71cd1d4c8a/snes)
- Il frontend diagnostico usa l'interfaccia libretro di Snes9x per accedere alla memoria e confrontare il risultato con l'esecuzione completa della cartuccia. [Snes9x libretro](https://github.com/libretro/snes9x/tree/fae2fea08f74180759ef540ee94259213f503480/libretro)

## Verifica con un secondo emulatore

Dopo l'estrazione, il seguente comando avvia Snes9x, seleziona il file di gioco e raggiunge Yoshi’s Island 1 con il controller. Confronta ogni cella del manifest con la WRAM della console emulata. L'opzione `--all-rooms` verifica anche tutte le stanze statiche della directory, entrando in ciascuna tramite un'uscita diagnostica. Richiede il core libretro della revisione usata da `tools/extract.mjs`.

```sh
python3 tools/rom/compare_native.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc" generated/content.json --all-rooms
```

### Generatori di sprite

`campaign.emitters` conserva le emissioni osservate chiamando il dispatcher originale `02:AFFE` per i generatori `CB`–`D8`. Il campionamento usa una camera a (512, 512), un generatore attivo, un seed iniziale azzerato e tutti gli slot sprite disponibili. Ogni evento riporta tick, ID sprite, coordinate relative alla camera, velocità in pixel per tick, stato C2 e direzione. Le raffiche dei Bullet Bill durano 322 tick. Le sequenze memorizzate rappresentano 6 cicli di raffica oppure 2.048 tick per gli altri generatori.

## Barra di stato PAL

`hud_capture.py` avvia il primo livello e ricava dalla VRAM il piano BG3 in formato 2bpp. Genera due basi trasparenti da 256×32 pixel con i nomi originali, cifre bianche e gialle, cifre alte delle stelle bonus, monete drago e sprite OBJ della riserva. La stella in riserva dispone di quattro fotogrammi di palette. Durante ogni estrazione ricompone la barra e confronta 22 combinazioni di contatori, giocatore e riserva con 180.224 pixel del raster Snes9x.
