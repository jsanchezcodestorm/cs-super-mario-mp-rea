# Super Mario World da solo o in cooperativa

Una o due persone giocano sulla stessa cartuccia europea 1.1 ricostruita per il browser. In singolo Mario controlla la campagna locale senza una connessione al server; in cooperativa ciascuno controlla un personaggio con la propria telecamera e un server Node gestisce tramite WebSocket i due giocatori, i nemici, le collisioni e la progressione della stanza.

## Giocare

In questa copia di lavoro le risorse sono già estratte. Con Node 24 o successivo, esegui questi comandi dalla radice del progetto.

```sh
npm ci
npm run build
npm start
```

Apri [il gioco in locale](http://127.0.0.1:8787). Mario crea una stanza, Luigi sceglie **Entra con codice** e inserisce i sei caratteri mostrati a Mario. Entrambi selezionano **Sono pronto**. Per provare da un solo computer puoi usare due finestre indipendenti.

Per giocare da soli seleziona **Gioca da solo**. La simulazione gira nel browser e controlli Mario sulla mappa e nei livelli; non serve creare una stanza. Puoi iniziare una nuova campagna o riprendere il salvataggio locale.

| Comando | Tastiera |
| --- | --- |
| Movimento, porte e tubi | Frecce |
| Salto | Z o Spazio |
| Corsa, presa, lancio, fuoco, lingua di Yoshi | X o Maiusc sinistro |
| Salto avvitato o discesa da Yoshi | A |
| Lascia cadere il potenziamento in riserva | C o Select sul gamepad |
| Entra nel corso selezionato, salta il filmato o torna alla mappa dopo il finale o il Game Over | Invio |

Su un gamepad standard, i pulsanti frontali **sinistro e superiore** corrispondono a Y e X del pad SNES. In sella, premi e rilascia uno dei due per ogni colpo di lingua. Il pulsante inferiore salta, quello destro fa il salto avvitato o scende da Yoshi e Start conferma.

Premi **Su** per aggrapparti a una grata, a una liana o a una corda mobile. Puoi lasciare le frecce e restare appeso. Sulle grate usa **Sinistra** e **Destra** per spostarti alla stessa altezza e **X** per colpire una porta girevole. Per saltare via usa **Z** o **Spazio**.

Il client accetta anche un gamepad con mappatura standard del browser. In cooperativa la nuova campagna si apre sulla mappa dopo che entrambi sono pronti: Mario percorre i collegamenti disponibili con le frecce e il primo giocatore che conferma su un corso avvia la partita per entrambi. Il checkpoint e l’uscita raggiunta da uno valgono per entrambi. La squadra parte con 10 vite condivise; i bonus aggiungono vite allo stesso totale, mostrato su entrambe le barre SNES. Potenziamenti e riserva restano personali. Colpire il nastro al traguardo assegna stelle secondo l’altezza e a 100 stelle si entra nel minigioco bonus. Chi esaurisce le vite segue il compagno e rientra al corso successivo con una vita condivisa.

Il server congela la simulazione quando uno dei due si disconnette. La stessa scheda può rientrare entro 60 secondi. Ogni browser conserva la campagna in IndexedDB ai checkpoint e ai cambi di fase. Per continuare dopo la chiusura della stanza, crea una stanza scegliendo **Riprendi campagna salvata**. Le stanze attive vivono nella memoria del processo.

## Rigenerare i dati da una nuova copia Git

La ROM locale e le risorse ricavate finiscono fuori dal controllo versione. Servono Git, Node 24+, Python 3, compilatori C e C++, Make e FFmpeg con encoder AAC e libx264. L’estrattore accetta la cartuccia E1 da 512 KiB e riconosce il prefisso copier opzionale di 512 byte.

```sh
npm ci
npm run extract -- "/percorso/Super Mario World (V1.1) (E) [!].smc"
npm run build
npm start
```

Con una sola ROM nella radice basta `npm run extract`. Il primo avvio dell’estrattore scarica e compila la revisione di Snes9x fissata in `tools/extract.mjs`. Per usare la stessa revisione già compilata, imposta `SNES9X_CORE` al percorso assoluto della libreria libretro. `FFMPEG` può indicare il percorso dell’eseguibile. Per sviluppare il frontend usa `npm run dev` e apri [Vite](http://localhost:5173).

## Lettura della cartuccia

- `tools/rom` verifica SHA-256 e checksum, converte gli indirizzi LoROM e segue le tre tabelle dei puntatori alle stanze. Esegue il caricatore originale sul processore 65C816 di LakeSnes per ricavare Map16, sfondi, palette, animazioni e punti di ingresso. Il confronto indipendente con Snes9x ha verificato cella per cella 211 griglie di primo piano, 14 griglie di collisione del secondo piano e 185 sfondi. [Disassemblato SMWDisX e simboli E1](https://github.com/IsoFrieze/SMWDisX) · [CPU LakeSnes](https://github.com/elzo-d/LakeSnes)
- `apps/web/tools` esegue routine della cartuccia per acquisire le pose dei personaggi e i comandi OAM degli sprite. Il rapporto locale `generated/creature-coverage.json` riporta le combinazioni di sprite e tileset per cui il campionamento ha prodotto immagini.
- `tools/reference` usa Snes9x offline per il titolo, l’audio, le mappe e i filmati. Per ricostruire i cambiamenti della mappa esegue il caricatore originale con i flag evento delle singole uscite e confronta le tilemap in VRAM. Il browser carica i risultati dall’host. I sette filmati dei castelli e i titoli di coda seguono il tempo della stanza. Nei sette ambienti a scorrimento automatico il server e il client usano lo stesso percorso della telecamera, campionato dal gioco PAL. [Core libretro Snes9x](https://github.com/libretro/snes9x)
- REA e Snes9x hanno verificato sulla cartuccia PAL le animazioni di personaggi, nemici, oggetti, livelli e mappa. La review riporta le sequenze confrontate nel browser e le differenze di durata adottate per la cooperativa. [Verifica delle animazioni](tools/rom/animazioni.md)

## Runtime e verifica

`packages/core` contiene la simulazione TypeScript deterministica. `packages/protocol` definisce i messaggi versionati. `apps/server` avanza a 60 tick/s, accetta i comandi numerati e invia snapshot a 30 Hz. `apps/web` usa Phaser, riconcilia gli input con gli snapshot del server e disegna entrambi i personaggi, le piattaforme e il terreno allo stesso tick della simulazione locale.

```sh
npm test
npm run test:campaign:online
npm run build
npx playwright install chromium
# Con npm start in un altro terminale
npm run test:browser
```

Il test browser apre due sessioni Chromium separate, crea una stanza, verifica il movimento dell’altro personaggio e ricarica una pagina per controllare la riconnessione. Una seconda prova ripristina un salvataggio sulla mappa e verifica che entrambi i browser registrino l’uscita del Palazzo Giallo quando Luigi preme l’interruttore in un’altra stanza. Le schermate sono in `test-results/`. I test del simulatore esercitano anche checkpoint, vite, porte, tubi, chiavi, interruttori e salvataggi. I replay in `tests/course-inputs.json` percorrono 13 corsi ciascuno dal proprio ingresso, inclusi tutti i livelli di Yoshi’s Island, Iggy e la Back Door fino alla sconfitta di Bowser. Il replay del finale verifica anche la durata dei titoli di coda.

I replay in `tests/coop-routes` percorrono le **72 uscite normali e le 24 segrete** con i controller di Mario e Luigi. La prova cumulativa parte da una mappa nuova, raccoglie potenziamenti nel gioco, attiva i quattro palazzi e conserva in ordine uscite, vite e risorse. Include il minigioco bonus e il rientro dopo un Game Over. I due percorsi aggiuntivi dalla Front Door e dalla Back Door arrivano a Bowser e mantengono il contatore a 96.

`npm run test:campaign:online` ripete la campagna con due client WebSocket locali. A ogni ingresso entrambi ricevono il salvataggio automatico e una nuova stanza lo riprende, così la registrazione dei comandi inizia sempre dallo stesso fotogramma. Il test confronta i progressi ricevuti dai due client a ogni tappa. In Chromium la prova riapre anche il salvataggio finale da **Riprendi campagna salvata · 96 uscite**, torna sulla mappa con Luigi e avvia un altro corso con Mario. Le registrazioni dei corsi usano triple `[pulsanti Mario, pulsanti Luigi, fotogrammi]`. L’ordine delle visite è in `tests/coop-routes/campaign.json`.

La cartuccia fornisce 235 stanze dagli slot principali, cinque varianti condizionali di Chocolate Island 2 e sei scene di ingresso. Il motore web reimplementa i comportamenti. Alcuni nemici condividono routine di movimento, le arene e i boss hanno differenze rispetto allo SNES e le tracce musicali sono registrazioni con ripetizione.

## Due computer sulla rete privata

Avvia il server sul computer che ospita la partita, indicando l’interfaccia di rete e la porta. Il comando seguente apre la porta 8787 sulle interfacce del computer.

```sh
HOST=0.0.0.0 PORT=8787 npm start
```

Entrambi i giocatori aprono lo stesso indirizzo LAN, per esempio `http://192.168.1.20:8787`. Con un reverse proxy HTTPS, inoltra anche l’upgrade WebSocket su `/ws`, conserva l’header `Host` e configura l’accesso privato sul proxy o sulla VPN. Il codice stanza assegna il secondo posto. Il processo serve il client compilato e la directory `generated`.
