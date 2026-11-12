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

## Maree e piattaforme della campagna

Per Mondo e Vanilla Secret 3 il limite dell’acqua viene dal piano grafico 3. Il lettore segue i due bit superiori di `05:F200` nella tabella E1 `00:9F8F`. In Vanilla Secret 3 la superficie resta a 384 pixel. In Mondo il gioco muove il piano con la routine `05:C494`. Nel confronto con Snes9x il registro di scorrimento verticale vale 112 all’ingresso e rispettivamente 115, 135 e 155 dopo 1.040, 1.120 e 1.200 frame PAL. La simulazione e il rendering usano la stessa quota.

Nella lista degli sprite, `E0` crea tre piattaforme `A3` con angoli iniziali differenti. In Forest Secret Area il primo contatto con una piattaforma `C1` avvia entrambe le piattaforme alate. In Vanilla Dome 3 ogni zattera `61` è composta da quattro teschi che seguono il profilo della lava. [Caricamento dei gruppi e zattere, banco 02](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_02.asm) · [Piattaforme alate, banco 03](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_03.asm)

## Misure della fisica PAL

I comandi seguenti riproducono le misure su Snes9x con la ROM E1. Il primo scrive le posizioni, le velocità e i flag della WRAM. Il secondo misura i salti dal primo livello e isola il punto di contatto della testa con diversi profili Map16.

```sh
python3 tools/rom/player_motion_capture.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc" /tmp/smw-movimento.json
python3 tools/rom/probe_player_contacts.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc"
```

| Prova | Cartuccia a 50 Hz | Simulazione web a 60 Hz |
| --- | ---: | ---: |
| Mondo, distanza dopo 0,8 s di scivolata | 29 px | 29,39 px |
| Mondo, distanza dopo 1,6 s di scivolata | 121 px | 121,25 px |
| Salto da fermo con B mantenuto, altezza e tempo di volo | 64 px, 0,94 s | 64,19 px, 0,80 s |
| Salto avvitato da fermo con A mantenuto | 54 px, 0,86 s | 57,81 px, 0,75 s |

A Mondo la prova parte da fermo, tiene premuto Giù per 0,2 secondi e poi rilascia il comando. Il motore usa le accelerazioni e le velocità limite delle tabelle PAL, compreso il cambio di segno sulla pendenza speculare. Sotto i soffitti inclinati la testa saggia il centro del personaggio. Sul tile `1C4`, con la sommità della cella a Y=224, il bordo inferiore del soffitto è a Y=226 per X locale 2 e a Y=233 per X locale 9. Il profilo speculare `1C5` dà rispettivamente 237 e 230. [Tabelle e routine del giocatore nel banco 00](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_00.asm)

Il confronto lascia aperte differenze nella gravità in discesa e nella frenata. Dopo una corsa piena l’inversione di direzione richiede circa 0,20 s sulla cartuccia e 0,35 s sul web. Rilasciando la direzione in aria la cartuccia conserva la velocità orizzontale nella prova di 0,30 s, mentre il web decelera.

Nella cooperativa il blocco rotante riacquista solidità al primo tick libero dopo la scadenza del timer, quando entrambi i personaggi sono usciti dal suo volume. Le uscite dei tubi orizzontali collocano il corpo al bordo esterno della bocca quando il giocatore riceve il controllo. Sulla cartuccia l’uscita include anche 28 fotogrammi di animazione.

Il controllo automatico dei replay misura la sovrapposizione del corpo di ciascun giocatore vivo con i blocchi solidi Map16 su entrambi i layer, applicando lo scostamento corrente del layer mobile. La tolleranza di un pixel corrisponde all’arretramento dei punti di contatto dei piedi. I test dedicati misurano anche i profili inclinati, i passaggi dal basso e il trasporto su piattaforme sprite.

Per la navigazione tra i corsi, `tools/reference/map_paths.py` imposta gli eventi della mappa nel core di riferimento e misura un comando alla volta, comprese le transizioni attraverso tubi e stelle. Nella E1 risultano 104 punti di sosta e 227 movimenti. Il gioco abilita i collegamenti verso i corsi sbloccati nel salvataggio condiviso.
