# Super Mario World in cooperativa

Due persone giocano sulla stessa cartuccia europea 1.1 ricostruita per il browser. Ciascuna controlla un personaggio con la propria telecamera. Un server Node gestisce tramite WebSocket i due giocatori, i nemici, le collisioni e la progressione della stanza.

## Giocare

In questa copia di lavoro le risorse sono già estratte. Con Node 24 o successivo, esegui questi comandi dalla radice del progetto.

```sh
npm ci
npm run build
npm start
```

Apri [il gioco in locale](http://127.0.0.1:8787). Mario crea una stanza, Luigi sceglie **Entra con codice** e inserisce i sei caratteri mostrati a Mario. Entrambi selezionano **Sono pronto**. Per provare da un solo computer puoi usare due finestre indipendenti.

| Comando | Tastiera |
| --- | --- |
| Movimento, porte e tubi | Frecce |
| Salto | Z o Spazio |
| Corsa, presa, lancio, fuoco, lingua di Yoshi | X o Maiusc sinistro |
| Salto avvitato o discesa da Yoshi | A |
| Lascia cadere il potenziamento in riserva | C o Select sul gamepad |
| Entra nel corso selezionato o salta il filmato | Invio |

Il client accetta anche un gamepad con mappatura standard del browser. In mappa le frecce selezionano i corsi sbloccati. Il checkpoint e l’uscita raggiunta da uno valgono per entrambi. Ogni personaggio ha le proprie vite, i propri potenziamenti e un oggetto in riserva. La barra SNES mostra le risorse del giocatore locale. Colpire il nastro al traguardo assegna stelle secondo l’altezza e a 100 stelle si entra nel minigioco bonus. Chi esaurisce le vite segue il compagno e rientra al corso successivo con una vita.

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
- REA ha analizzato il bundle JavaScript e verificato in Chromium l’accesso al modulo per entrare con un codice. La lettura della CPU, della VRAM e dell’audio SNES usa gli strumenti specifici sopra descritti.

## Runtime e verifica

`packages/core` contiene la simulazione TypeScript deterministica. `packages/protocol` definisce i messaggi versionati. `apps/server` avanza a 60 tick/s, accetta i comandi numerati e invia snapshot a 30 Hz. `apps/web` usa Phaser, predice il movimento, riconcilia gli input confermati e interpola i personaggi remoti.

```sh
npm test
npm run build
npx playwright install chromium
# Con npm start in un altro terminale
npm run test:browser
```

Il test browser apre due sessioni Chromium separate, crea una stanza, verifica il movimento dell’altro personaggio e ricarica una pagina per controllare la riconnessione. Una seconda prova ripristina un salvataggio sulla mappa e verifica che entrambi i browser registrino l’uscita del Palazzo Giallo quando Luigi preme l’interruttore in un’altra stanza. Le schermate sono in `test-results/`. I test del simulatore esercitano anche checkpoint, vite, porte, tubi, chiavi, interruttori e salvataggi. I replay in `tests/course-inputs.json` percorrono 13 corsi ciascuno dal proprio ingresso, inclusi tutti i livelli di Yoshi’s Island, Iggy e la Back Door fino alla sconfitta di Bowser. Il replay del finale verifica anche la durata dei titoli di coda.

La cartuccia fornisce 235 stanze dagli slot principali, cinque varianti condizionali di Chocolate Island 2 e sei scene di ingresso. Il motore web reimplementa i comportamenti. Alcuni nemici condividono routine di movimento, le arene e i boss hanno differenze rispetto allo SNES e le tracce musicali sono registrazioni con ripetizione. La verifica integrale di tutte le 96 uscite con due giocatori rimane aperta.

## Due computer sulla rete privata

Avvia il server sul computer che ospita la partita, indicando l’interfaccia di rete e la porta. Il comando seguente apre la porta 8787 sulle interfacce del computer.

```sh
HOST=0.0.0.0 PORT=8787 npm start
```

Entrambi i giocatori aprono lo stesso indirizzo LAN, per esempio `http://192.168.1.20:8787`. Con un reverse proxy HTTPS, inoltra anche l’upgrade WebSocket su `/ws`, conserva l’header `Host` e configura l’accesso privato sul proxy o sulla VPN. Il codice stanza assegna il secondo posto. Il processo serve il client compilato e la directory `generated`.
