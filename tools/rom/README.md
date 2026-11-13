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

Ogni atlante ha 32 colonne di celle da 16 pixel. Le prime 512 celle contengono il primo piano e le seconde 512 lo sfondo. `animatedTiles` associa una cella animata a 32 fotogrammi PAL. Ogni quadrante segue il proprio slot di trasferimento in VRAM. Il colore CGRAM `$64` segue otto fasi. Le chiavi da 1024 in poi selezionano le varianti delle celle con caratteri controllati dall’interruttore ON/OFF. Nel test `--off` forza lo stato dell’interruttore e isola il trasferimento grafico dal soffitto mobile. Il confronto con Snes9x può essere ripetuto con `tools/rom/probe_tile_animation.py`, passando il core libretro, la ROM, il manifest e gli ID delle stanze. L’opzione `--all-atlases` sceglie una stanza per ciascun atlante accessibile dagli ingressi ordinari. La struttura `background.scroll` descrive i rapporti di scorrimento della camera e lo scostamento iniziale per l'ingresso principale. Le scene ricevono anche i punti di ingresso, le uscite, le coordinate degli sprite, le palette, le impostazioni del timer, le griglie collisioni del secondo layer e le tabelle di movimento lette dalla ROM.

In Donut Plains 2 (`009`) il controller `E8` sposta separatamente la telecamera e le rocce solide. A ogni fotogramma PAL, `scroll_capture.py` registra la differenza fra i registri di posizione di BG1 e BG2. Il movimento verticale osservato va da −101 a +66 pixel. Il renderer e le collisioni leggono lo stesso spostamento della stanza. Prova REA `ev_bca9656ff2393eee583ae113fd0b7831363052a10a33fc5c90e918d6cb5388d5`. [Estrazione della traiettoria](scroll_capture.py)

In Butter Bridge 1 (`00c`) ogni fungo a bilancia (`8F`) contiene due piatti da 32 pixel. La colonna di origine imposta una distanza di 64 o 128 pixel. Con un giocatore su un piatto la ROM muove l'altro in senso opposto di mezzo pixel per fotogramma PAL. A bilancia scarica torna in piano a un ottavo di pixel per fotogramma. In cooperativa i giocatori sui due piatti si controbilanciano. I quattro confronti REA coprono 256 coppie di posizioni, le tessere del gambo e le due larghezze, con prova `ev_11bd7f9216f794178bf871fb0af0aa5067d1a217f047c97b3680df8a642c303e`. [Sonda sulla ROM](probe_scale_platforms.py) · [Contatti dei due giocatori](../../tests/scale-platforms.test.ts) · [Confronto in Chromium](../../tests/browser-moving-platforms.mjs)

Nelle cinque stanze con piattaforme e funi su rotaia sono presenti 25 meccanismi. Il ponte marrone di Donut Plains 3 parte da solo. Le pedane del tipo `63` partono quando sale un giocatore, e le funi quando un giocatore si aggrappa con Su. Le due funi lunghe di Cheese Bridge Area misurano 144 pixel, mentre quelle corte ne misurano 80. La sonda REA `ev_90bad9ffc90412390f86d8a33cb90618c17f51c22963644c403d9036d8b37466` confronta 734 posizioni PAL, incluse 500 posizioni consecutive sul circuito curvo di Donut Plains 3. [Sonda rotaie](probe_rail_decks.py) · [Confronti con la simulazione](../../tests/rail-decks.test.ts)

I due ponti alati di Forest Secret Area partono insieme quando uno dei giocatori sale a bordo. Dopo 254 fotogrammi di movimento invertono la direzione verticale, con inversioni successive a distanza di 512 fotogrammi. REA ha registrato 579 posizioni per ciascun ponte e 260 fotogrammi di volo della piattaforma dei Martelkoopa. Prova `ev_6abd9140e59e43b48cb49c27cbbd43f6f08b5f8dd8089310cddb7a844bcad5df`. [Sonda dei ponti alati](probe_flying_decks.py)

Per le piattaforme a scacchi, quelle inclinate e i blocchi scorrevoli dei castelli, la sonda confronta le coordinate a fotogrammi PAL prestabiliti. Per le piattaforme galleggianti e i delfini misura anche direzione ed escursione. In Vanilla Secret 3 i delfini emessi dal generatore conservano la velocità orizzontale e ripartono verso l’alto al contatto con l’acqua. Prova REA `ev_496ba6e67e96cd091caa72af953333f2d2748d50d8092c5bc9fb1715137975d3`. [Sonda delle piattaforme mobili](probe_moving_lifts.py) · [Verifiche del movimento e dell’appoggio](../../packages/core/test/travelling-lifts.test.ts)

## Boss Mode 7

`boss_capture.py` avvia la ROM nel core libretro di riferimento, raggiunge il primo livello e percorre un'uscita diagnostica per entrare in ciascuna arena. Decodifica caratteri e tilemap Mode 7 da VRAM, sprite da OAM e colori da CGRAM. Isola gli elementi di scenario usando le opzioni dei layer di Snes9x. Il manifest in `generated/bosses/index.json` associa le stanze alle immagini dei sette boss che utilizzano queste arene, alle piattaforme oscillanti e alla ruota dei Reznor. Le tracce indicano il raster da disegnare a ciascun frame PAL campionato. Ogni Reznor e ciascuna testa nei tubi hanno una traccia propria.

Morton, Roy, Ludwig e il mezzo di Bowser sono disegnati nel BG1 Mode 7, fra OBJ0 e OBJ1. Iggy, Larry e i quattro Reznor usano OBJ3. Nelle stanze con tubi Lemmy, Wendy e le loro copie usano OBJ1. Per ogni posa OBJ il manifest conserva i bit di priorità e il primo indice OAM con pixel visibili. I quattro Reznor conservano ciascuno il proprio indice, come le due copie che emergono dai tubi. Le strisce del castello che passano a Mode 1 durante il fotogramma usano la profondità osservata nel framebuffer. L’estrattore allinea la mappa delle profondità alle 224 righe visibili, dopo il ritaglio PAL di sette righe. [Composizione Mode 7 in Snes9x](https://github.com/libretro/snes9x/blob/fae2fea08f74180759ef540ee94259213f503480/gfx.cpp#L432-L445)

Il ponte di Bowser comprende tre file di OBJ3. Nella cattura gli indici minimi sono 15 per i merli, 111 per il muro e 5 per il bordo inferiore. Il confronto sui 8.048 pixel delle tre file esterni alla figura di Mario coincide con il framebuffer della cartuccia. La rotazione e lo spostamento delle arene sul web seguono la simulazione di gioco.

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

Per la navigazione tra i corsi, `tools/reference/map_paths.py` imposta gli eventi della mappa nel core di riferimento e misura un comando alla volta, comprese le transizioni attraverso tubi e stelle. Nella E1 risultano 104 punti di sosta e 227 movimenti. Il gioco abilita i collegamenti verso i corsi sbloccati nel salvataggio condiviso. Il tracciato delle pose distingue terra, acqua, arrampicata, stella e cambio di mappa. L’atlante OAM include entrambi i giocatori a piedi e sui quattro colori di Yoshi.

Le tessere delle sette mappe e dei percorsi sbloccati riproducono i trasferimenti di caratteri e palette osservati nel core. Il ciclo dura 128 fotogrammi PAL. Nella Valle di Bowser il ciclo misurato dei lampi e delle tessere dura 1.024 fotogrammi.

Il blocco rotante `11E` occupa la cella solida invisibile `152` durante i sei fotogrammi del rimbalzo OBJ. Dal sesto fotogramma PAL la mappa mostra il tile attraversabile `048`. Sulla cartuccia al fotogramma 255 il blocco torna solido. La versione cooperativa consente il passaggio dal colpo per 155 tick di simulazione e rimanda la chiusura finché un giocatore occupa la cella. Il disegno torna fermo al momento della chiusura effettiva.

## Gusci e stanze con tre blocchi per fila

Questi due comandi avviano Snes9x sulla cartuccia PAL E1 e controllano i risultati direttamente in WRAM.

```sh
python3 tools/rom/probe_shell_contacts.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc"
python3 tools/rom/probe_bonus_questions.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc"
```

Nel primo esperimento un guscio attraversa una fila di dieci Koopa rossi su un piano. La cartuccia registra 200, 400, 800, 1.000, 2.000, 4.000 e 8.000 punti, seguiti da tre vite. Lo sprite colpito da un lato riceve velocità orizzontale di 1 pixel per fotogramma nella direzione del guscio e velocità verticale iniziale di −3. Un altro guscio fermo viene scagliato via. Due gusci in corsa vengono entrambi eliminati e producono un singolo premio da 1.000 punti. La chiave, il pulsante P, il fungo, la moneta e Boo restano intatti nei due ordini degli slot e nelle due direzioni. Il calcio laterale dato a piedi a un guscio fermo vale separatamente 200 punti con il contatore dei salti a zero. Lanciando lo stesso guscio dalle mani il primo premio arriva all’urto con il bersaglio. [Interazione tra sprite e contatori, banco 01](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_01.asm#L4927-L5238) · [Punteggio e vite, banco 02](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_02.asm#L5912-L5931)

Nel secondo esperimento, nella stanza `0BD`, un salto sotto ciascun blocco della fila inferiore viene provato nelle quattro fasi del contatore dei fotogrammi. Il primo blocco dà una moneta e mostra la O nelle fasi 1, 2 e 3. Il secondo accetta le fasi 1 e 3. Il terzo dà un fungo 1-UP in tutte e quattro. Un errore chiude le caselle ancora disponibili nella fila. La routine PAL si trova a `00:F1E9`. In cooperativa la visita finisce quando l’ultimo giocatore lascia la stanza. [Routine dei blocchi bonus, banco 00](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_00.asm#L12919-L12984)

### Blocchi con punto interrogativo

La sonda `probe_question_blocks.py` usa salti sulla cartuccia PAL in Snes9x. Il blocco moneta `124` passa per la cella solida temporanea `152` e si assesta su `132`. Nel campione la moneta viene contata al frame 9 e il punteggio passa a 10 al frame 41. Il blocco multimoneta `123` si riattiva ai primi due colpi e si esaurisce al terzo dopo l’attesa misurata. Un blocco con fungo non accredita punti al colpo. Sul web l’accredito avviene subito perché il salvataggio condiviso possa includerlo anche se si esce dalla stanza durante l’animazione. La moneta e il numero seguono le rispettive fasi visive. La prova REA è registrata in `ev_75e2462afce81f5edd4cf2d69fab5878e6f14f7b5fd29bbec1902b8d808629ab`.

Nelle prove dei due blocchi alati, sprite `83` e `84`, il colpo dal basso ferma il volo. Con Mario piccolo le quattro colonne consecutive producono rispettivamente una moneta, un fungo, un fungo e un 1-UP. Entrambi i client usano il giocatore che ha dato il colpo per scegliere il potenziamento.

### Accovacciarsi con Giù

Il comando seguente misura la postura in Yoshi’s Island 1 usando input del controller e la ROM E1. Il probe crea un tratto piano e ripete la stessa sequenza nelle quattro forme di Mario. Per la prova in sella prepara uno slot Yoshi nello stato montato.

```sh
python3 tools/rom/probe_duck.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc"
```

A piedi, il primo frame con Giù imposta `$73=4` e la posa `$13E0=60`. Tenendo anche Destra per dieci frame da fermo, X resta invariata. Un salto iniziato accovacciati conserva la postura anche rilasciando Giù in aria. Sul fondo di una zona d’acqua Giù abbassa il personaggio e una bracciata lo rialza. A terra un salto avvitato termina la postura. Su Yoshi si osservano la posa giocatore 29 e la posa cavalcatura 4. In E1, la routine `GetMarioClipping` legge le altezze di contatto con gli sprite a `03:B660`. A piedi usa 26 pixel per la forma grande e 12 per la forma piccola o accovacciata. In sella i valori sono 32 e 24. Il terreno dispone di sonde proprie. La prova REA con Snes9x è registrata in `ev_817e200369a8bd6cd9ed39e33e04fa86a764c656858c531c220d3241141cd41c`. [Routine di contatto del banco 03](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_03.asm)

### Lingua, bacche e premi di Yoshi

La sonda monta Yoshi su un tratto piano di Yoshi’s Island 1, alterna i turni originali di Mario e Luigi e legge i loro contatori separati dopo l’ingestione. Tenendo premuto X o Y parte un attacco. La lingua compare dal nono fotogramma PAL, raggiunge 33 pixel al diciannovesimo, resta estesa fino al ventiseiesimo e scompare dopo il trentacinquesimo. La ROM usa quattro tessere di lingua e una per la punta. [Disegno e interazione della lingua](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_01.asm#L15450-L15866)

```sh
python3 tools/rom/probe_yoshi_food.py "/percorso/snes9x_libretro.dylib" "/percorso/gioco.smc"
```

In entrambi i turni il Galoomba dà una moneta, la moneta mobile dà una moneta e 200 punti, fungo, fiore, stella e piuma danno 1.000 punti e il fungo verde dà una vita. Boo resta fuori dalla bocca. Un Koopa rosso e una chiave possono rimanere in bocca o essere sputati. Lasciando scadere il tempo di attesa, entrambi danno una moneta. Le tre bacche valgono una moneta e zero punti, anche raccogliendole a contatto con il muso. La casella diventa fogliame `049`. La decima rossa produce un uovo contenente un fungo, la seconda rosa un uovo con la nuvola bonus e la verde aggiunge 20 unità al timer. Prova REA `ev_1575cde9217db6ba2832a5b0e100dfc16514cbf6631b7c6965c6558195a56199`. [Premi delle bacche](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_01.asm#L15159-L15208)

La sonda `probe_yoshi_cloud.py` usa gli stessi due argomenti e segue l’uovo della seconda bacca rosa fino alla schiusa. La nuvola emette dieci monete a distanza di 128 fotogrammi PAL. La presa di ciascuna moneta vale 100 punti. Nel confronto fra nove e dieci prese, soltanto la decima completa la condizione per ricevere un fungo 1-UP all’intervallo successivo. La prova posiziona le monete sul cavaliere ed esegue la collisione e il calcolo del premio con il codice della cartuccia. Prova REA `ev_b94c319df6e903d8981693aa783f6cfc880a6d74c3603310bfaf39d6d834692f`. [Routine della nuvola bonus](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_02.asm#L14662-L14825)

La sonda `probe_yoshi_drawing.py` segue tutti i fotogrammi in entrambe le direzioni, tenendo Su o lasciandolo libero. La lingua usa quattro segmenti e una punta negli slot OAM 3–7. La distanza tra i segmenti è la parte intera della lunghezza divisa per quattro. In pieno allungo la ROM sovrappone alla testa tre pixel opachi della lingua in posa bassa e due in posa alta. Nel port quei pixel mostrano il muso di Yoshi per rispettare l’ordine richiesto. La lingua conserva la priorità originaria sugli altri oggetti. La prova REA è registrata in `ev_3a862006126594ebb330d3c4dc7a3a35f0e1dfd0b85c694374e0281b0e3e71e2`. [Disegno e aggancio della lingua nel banco 01](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_01.asm#L15572-L15738)

## Priorità dei piani e acqua BG3

`probe_emergence.py` segue in Snes9x quattro bocche di tubo, a piedi e in sella. In `0BD` e `1F0` il passaggio orizzontale di Mario piccolo dura 28 frame PAL, in `0C6` l’uscita verso l’alto ne dura 30 e in `1C9` la discesa ne dura 15. In sella durano rispettivamente 54, 54, 40 e 25 frame. Il giocatore e Yoshi passano entrambi da OBJ1 a OBJ2. Nella fila inferiore di `0BD` il fungo 1-UP resta nascosto per i primi otto frame, usa OBJ1 dal nono al sessantunesimo e torna a OBJ2 al sessantaduesimo. In E1 la routine dei power-up si trova a `01:C399` e il controllo di visibilità a `01:C497`. Prova REA `ev_525cd1af73bbfccb50f3f486ce3fa521eef5301fc879909ce0ea10d3468d05cc`. [Routine OAM dei power-up](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_01.asm#L9195-L9209)

Il port legge il tipo di ingresso dalle tabelle degli ingressi primari e secondari e verifica la presenza fisica della bocca. L’emersione usa il tick della simulazione condivisa. Sul web il personaggio risponde ai comandi già all’arrivo nella stanza e i power-up sono raccoglibili secondo le regole della simulazione. Lo scarto grafico si riduce con la distanza finché lo sprite si riunisce alla posizione di collisione. L’animazione termina se lo sprite si allontana dalla bocca o dal blocco. Le ricompense dei blocchi alati conservano la priorità ordinaria, come nel ramo della ROM che verifica `$1528`.

`probe_layer_priority.py` ripristina lo stesso stato PAL per confrontare i colori del solo sprite, del solo sfondo e dei due piani sovrapposti. Conta esclusivamente pixel opachi di colori diversi. In Yoshi’s Island 2 il cespuglio resta dietro tutti i 197 pixel campionati di Mario. Mentre Mario emerge dai tubi di `1C9` e `0BD`, il tubo gli copre rispettivamente 164 e 180 pixel. La cartuccia imposta il flag `$13F9` a 2 durante il passaggio e l’attributo OAM passa dalla priorità 2 alla 1. [Routine del tubo](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_00.asm#L9594-L9603) · [Attributi OAM del giocatore](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_00.asm#L11411-L11427)

In Mode 1 i pixel del BG1 hanno profondità 11 o 15, quelli del BG2 10 o 14. Le quattro priorità OBJ corrispondono a 4, 8, 12 e 16 nella scala interna di Snes9x. BG3 ha profondità 3 o 7, con il valore alto che sale a 17 quando è attivo il bit 3 di BGMODE. Le priorità si applicano ai piani assegnati allo stesso schermo. Nella stanza `1CF`, il BG2 è sullo schermo principale. La sonda confronta i pixel nativi e ripete la misura modificando il solo bit di priorità delle sue celle VRAM. I 175 pixel di Mario e i 1.384 pixel del BG1 sovrapposti al BG2 cambiano tutti ordine. [Renderer Mode 1 di Snes9x](https://github.com/libretro/snes9x/blob/fae2fea08f74180759ef540ee94259213f503480/gfx.cpp#L392-L407)

`tide_capture.py` legge le parole di tilemap, la grafica 2bpp e la CGRAM dei cinque sublevel con marea. L’asset ripete una striscia di superficie di 16×8 pixel e una di acqua profonda di 16×8 pixel. Su 128 frame per stanza cambia lo scorrimento orizzontale di un pixel per frame PAL più lo spostamento della camera. La superficie visibile inizia otto pixel sopra la quota di nuoto. L’estrazione confronta con il raster nativo 190.464 pixel, inclusi i punti in cui dall’acqua traspaiono gli altri piani. Le due sonde REA relative ai gusci e alle priorità riportano rispettivamente `ev_190d918c531b6b31e7802335eec203bb7864daef5099c4cbba9177f23e53b026` e `ev_03b8c493b20999c0c7c4faa239e114e535067fbcf36b7c2b85211b727f50f059`. [Scorrimento nativo delle maree](https://github.com/IsoFrieze/SMWDisX/blob/30643c7595a7d097d731de69476f8059c7cf98c3/bank_05.asm#L5577-L5631)

La copertura di personaggi, livelli, mappe e filmati è raccolta nella [verifica delle animazioni PAL](animazioni.md).

## Animazioni del giocatore e della cavalcatura

`probe_player_animation.py` avvia E1 in Snes9x e legge la posa, il verso, la fase del passo e il fotogramma del mantello dopo ogni input. Usa il controller 1 per Mario e il controller 2 per Luigi. Per ciascuna delle quattro forme esegue nove sequenze, tra cui frenata, salto di rincorsa, avvitamento, nuoto e arrampicata. La camminata ha due pose nella forma piccola e tre nelle altre. Il salto ordinario passa da 11 a 36. La posa 12 appartiene al salto di rincorsa. Una bracciata passa per 22, 24 e 26 e torna a 22. Prova REA `ev_8770b2397a0a43677eca781fc4846d6395973a7bcdd0b49aa79b18330ff54689`.

La stessa sonda attraversa i tubi di `0BD`, `1F0`, `0C6` e `1C9` a piedi e in sella. Nei tubi orizzontali il cavaliere usa la posa 41 e Yoshi alterna 8 e 9. Nei verticali il cavaliere usa 33 e il disegno di Yoshi seleziona temporaneamente la posa 3. Durante il passaggio il muso passa allo slot OAM 65, davanti al cavaliere, mentre il corpo conserva lo slot assegnato nella stanza.

Le prove di regressione in `tests/player-animation.test.ts` controllano le sequenze nel port e l'esistenza delle pose nell'atlante. Il momento di apertura del mantello e la progressione dell'inclinazione seguono la traiettoria della simulazione cooperativa. La prova nativa campiona le azioni e i tubi indicati e non costituisce un confronto continuo di ogni fotogramma delle 96 uscite.

La sonda `probe_goal_walk.py` attiva il nastro tramite la collisione nativa e segue automaticamente entrambi i turni, a piedi e in sella. Sul terreno piano Mario e Luigi a piedi avanzano di 111 pixel prima del saluto al frame 358 PAL. La posa 38 dura 110 frame e la mappa subentra al frame 531. In sella il saluto usa la posa 20 dal frame 359 e la transizione del campione termina ai frame 547–548. Nel port entrambi i giocatori vivi nella stanza partecipano alla marcia e la camera segue chi ha attivato il nastro. Bonus, salvataggio e comandi sulla mappa riutilizzano la progressione cooperativa esistente. Tempi e chiusura dell'iride sono calibrati su questi campioni. Prova REA `ev_33d4185ad5d35cfb8897d23c63be2f71483a4f5b9ee20d6015f5159d479ea813`.


## Animazioni OBJ, piattaforme e reti

`probe_actor_animation.py` avvia otto tipi di sprite nella E1 e confronta l'INIT con 32 fasi attive. L'INIT lascia l'OAM vuota. Il guscio calciato alterna i caratteri 8C, 8A, 8E e 8A specchiato ogni quattro frame PAL. Il guscio fermo mantiene 8C. L'atlante cattura anche il Rex compresso, il Mechakoopa stordito e i figli prodotti durante il gioco. Prova REA `ev_ee55419ffd025694354a11fcd6f2698b5085377329b1eab0ef8a7f9cb976581b`.

`probe_net_animations.py` confronta i sei pezzi della piattaforma grigia con l'OAM dopo un passo e aziona due volte il chiavistello in 1D3. Le maglie sono a un terzo, due terzi e al centro della pedana. La porta comincia a girare dodici frame PAL dopo Y, cambia lato al ventisettesimo e torna ferma al quarantatreesimo. Durante il giro la E1 scrive 6×6 caratteri sostitutivi nel BG1 e disegna la parte mobile in OBJ2. La registrazione delle sei porte nei due livelli verifica il passaggio di entrambi i giocatori e il ritorno di uno solo. Prova REA `ev_5e7ecc0f44e03b00f57199fe766b4763107cf7dec85a1ccb2a81784e14af9293`.


Il pannello di fine livello viene estratto da `course_clear.py`. La sonda REA `ev_4e7c34c254df8afef83da77b57d1c58c7556458dc593be8cd77d0222675cdd35` confronta 241.920 pixel del BG3 nativo su 30 fotogrammi di Mario e Luigi, inclusa l’uscita senza stelle. Il titolo appare al frame PAL 161, la striscia bonus al 202 e il trasferimento del tempo residuo inizia al 243 o al 283 secondo la presenza di stelle. Le rampe di luminosità vengono dalla tabella E1 $00:AE7E e il contorno dell’iride dalla tabella $00:CB05. L’estrazione identifica le celle che mantengono la palette in tutti i 35 atlanti usati dalle 67 stanze con un nastro. In cooperativa il vincitore guida la scena per entrambi fino alla chiusura dell’iride. Anche al raggiungimento delle 100 stelle il vincitore completa il saluto prima di entrare nel bonus.


La sonda [probe_goal_transitions.py](probe_goal_transitions.py) confronta i due controller su 531 fotogrammi PAL del nastro. Posizione, posa e raggio dell’iride coincidono con o senza comandi di movimento e salto, anche con il timer a 0 o a 999. Al fotogramma 531 il gioco sceglie la mappa oppure il bonus. Nella nave affondata la sfera originale della stanza verticale `0f7` blocca la posizione dei giocatori. Il pannello appare al fotogramma 2, trasferisce il tempo in punti dal fotogramma 84 e sfuma l’intero schermo dal 352 al 382. La cattura REA è `ev_4635a1b143eb67657d9bdc7bf4f7ee16e7f65e940bb0a96d2a4ceefe01ca0be4`.

La sonda `../reference/map_decorations.py` segue le routine della mappa per 4.096 frame PAL. I tre Boo ripetono la traiettoria ogni 768 frame, il fumo ogni 192, l’insegna di Bowser ogni 16 e la Clown Car ogni 960. Nelle sei traversate che attivano il pesce, la ROM usa un unico slot per 79 frame e alterna due tessere durante l’arco. Le nuvole seguono lo scorrimento, mentre la visibilità del Boo nella Foresta dipende dai bit degli eventi 43 e 46. Per i pixel coperti dal BG1 l’estrattore legge le maschere dalle tile 4bpp e le ricalcola dopo l’apertura dei percorsi. Prova REA `ev_dd1295d1161fff480d26ed44c9050f586ca2c8670ec5832c26be769ef3973cd8`.

La rivelazione dei percorsi viene campionata da `../reference/map_reveals.py` dopo aver aperto gli eventi necessari per raggiungere il corso. Il banco 04 aggiorna progressivamente le celle e compone le dissolvenze in regioni da 16×16 o 48×48 pixel. Delle 96 uscite, 92 producono una sequenza visibile nella regione corrente. Gli eventi 32 e 79 non cambiano la mappa e le uscite normali di Star World 2 e 3 cambiano la regione principale. Il test Chromium confronta le cinque fasi di Yoshi’s Island 1 con il framebuffer e un campione di ogni palazzo con gli sprite OAM nativi. Le quattro onde dei palazzi durano 223 frame PAL. La sonda REA `ev_cb2b4a93f90e6d2973c3b1742a056bee05d8688fbc1898e11fb5ec6241b12fe7` verifica 9.343 posizioni, indici e attributi di sprite durante le prime 190 iterazioni dei palazzi.


La sonda `probe_goal_coins.py` attraversa le ultime schermate di 105 caricando il Chuck e il nastro dalle rispettive posizioni originali. Passando sotto al nastro, i due sprite diventano monete e assegnano 500 punti complessivi. Il test separa i bersagli visibili, quelli da cancellare, Yoshi e il Koopa fuori schermo. Con otto o dieci bersagli verifica il riuso dei sei cartellini e gli accrediti non comuni della ROM PAL. In Chromium il Chuck rimane alla stessa X di schermo durante il fumo e la moneta raggiunge un’altezza di 38 pixel prima del cartellino. Traccia REA `ev_7ae20e2f183d8be2af1371bb292ca0a1c3628f678901ffdfb92ceb2d3ddb8c5c`.
