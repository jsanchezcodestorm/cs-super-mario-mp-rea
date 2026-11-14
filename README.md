# Super Mario World da solo o in cooperativa

Da uno a otto giocatori possono esplorare la stessa cartuccia europea 1.1 ricostruita per il browser. Le campagne, i progressi e i risultati sono salvati in PostgreSQL; le partite singole e cooperative usano la simulazione server-side. Ogni persona accede con un account verificato via email e sceglie Mario o Luigi per ogni sessione. In co-op, il proprietario condivide una campagna privata tramite invito.

## Giocare

In questa copia di lavoro le risorse sono già estratte. Servono Node 24 o successivo e Docker Compose. Dalla radice del progetto prepara l’ambiente locale ed esegui il comando di sviluppo:

```sh
npm ci
npm run build
cp .env.example .env
npm run dev
```

`npm run dev` avvia PostgreSQL e Mailpit con Docker Compose, genera il client Prisma, applica le migrazioni e avvia API e Vite. Apri [il gioco in locale](http://localhost:5173) e [la casella Mailpit](http://localhost:8025) per vedere i link di verifica email e recupero password. Il database usa un volume Docker, quindi i dati restano dopo l’arresto dei processi. `npm run db:down` ferma PostgreSQL e Mailpit senza rimuovere il volume.

`SMTP_URL` in `.env` punta già al servizio SMTP locale di Mailpit. I messaggi restano nella casella di sviluppo e non vengono inoltrati ai destinatari reali. Per un ambiente ospitato, configura invece `SMTP_URL` con il provider email scelto e imposta `PUBLIC_APP_URL` sull’indirizzo pubblico dell’app.

Registrati con un indirizzo `@codestorm.it`, scegli nickname e password, poi verifica l’indirizzo dal link email. Per accedere usa email e password; dalla pagina di login puoi chiedere il ripristino della password. Dopo l’accesso crea una campagna singola o co-op. Per una stanza co-op, condividi il codice con un account già invitato alla campagna. Per avviare una partita singola non serve una stanza: anche quella sessione viene salvata dal server e compare nella cronologia account.

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

Il client accetta anche un gamepad con mappatura standard del browser. In cooperativa la campagna si apre sulla mappa dopo l’avvio dell’ospite. Ogni personaggio mostra il nickname scelto dal giocatore. Un giocatore propone il corso e tutti gli altri confermano l’ingresso. Il checkpoint e l’uscita raggiunta da uno valgono per il gruppo. La squadra parte con 10 vite condivise; i bonus aggiungono vite allo stesso totale, mostrato sulle barre SNES. Potenziamenti e riserva restano personali. Colpire il nastro al traguardo assegna stelle secondo l’altezza e a 100 stelle si entra nel minigioco bonus. Chi esaurisce le vite segue il gruppo e rientra al corso successivo con una vita condivisa.

Il server congela la simulazione quando un giocatore si disconnette. Lo stesso account può rientrare entro 60 secondi dallo stesso browser. Il server salva la campagna ai checkpoint, ai cambi di fase e ogni 30 secondi. Dopo la chiusura o un riavvio, un membro può riaprire la campagna dall’ultimo salvataggio durevole. Le stanze attive vivono nella memoria del processo; PostgreSQL conserva campagne, sessioni, partecipanti, risultati e checkpoint.

## Rigenerare i dati da una nuova copia Git

La ROM locale e le risorse ricavate finiscono fuori dal controllo versione. Servono Git, Node 24+, Python 3, compilatori C e C++, Make e FFmpeg con encoder AAC e libx264. L’estrattore accetta la cartuccia E1 da 512 KiB e riconosce il prefisso copier opzionale di 512 byte.

```sh
npm ci
npm run extract -- "/percorso/Super Mario World (V1.1) (E) [!].smc"
npm run build
npm start
```

Con una sola ROM nella radice basta `npm run extract`. Il primo avvio dell’estrattore scarica e compila la revisione di Snes9x fissata in `tools/extract.mjs`. Per usare la stessa revisione già compilata, imposta `SNES9X_CORE` al percorso assoluto della libreria libretro. `FFMPEG` può indicare il percorso dell’eseguibile. Per sviluppare lo stack locale esegui `npm run dev`: prepara PostgreSQL e le migrazioni, poi avvia server e frontend con riavvio automatico del server e aggiornamento live di Vite. Apri [Vite](http://localhost:5173).

## Lettura della cartuccia

- `tools/rom` verifica SHA-256 e checksum, converte gli indirizzi LoROM e segue le tre tabelle dei puntatori alle stanze. Esegue il caricatore originale sul processore 65C816 di LakeSnes per ricavare Map16, sfondi, palette, animazioni e punti di ingresso. Il confronto indipendente con Snes9x ha verificato cella per cella 211 griglie di primo piano, 14 griglie di collisione del secondo piano e 185 sfondi. [Disassemblato SMWDisX e simboli E1](https://github.com/IsoFrieze/SMWDisX) · [CPU LakeSnes](https://github.com/elzo-d/LakeSnes)
- `apps/web/tools` esegue routine della cartuccia per acquisire le pose dei personaggi e i comandi OAM degli sprite. Il rapporto locale `generated/creature-coverage.json` riporta le combinazioni di sprite e tileset per cui il campionamento ha prodotto immagini.
- `tools/reference` usa Snes9x offline per il titolo, l’audio, le mappe e i filmati. Per ricostruire i cambiamenti della mappa esegue il caricatore originale con i flag evento delle singole uscite e confronta le tilemap in VRAM. Il browser carica i risultati dall’host. I sette filmati dei castelli e i titoli di coda seguono il tempo della stanza. Nei sette ambienti a scorrimento automatico il server e il client usano lo stesso percorso della telecamera, campionato dal gioco PAL. [Core libretro Snes9x](https://github.com/libretro/snes9x)
- REA e Snes9x hanno verificato sulla cartuccia PAL le animazioni di personaggi, nemici, oggetti, livelli e mappa. La review riporta le sequenze confrontate nel browser e le differenze di durata adottate per la cooperativa. [Verifica delle animazioni](tools/rom/animazioni.md)

## Runtime e verifica

`packages/core` contiene la simulazione TypeScript deterministica. `packages/protocol` definisce i messaggi versionati. `apps/server` avanza a 60 tick/s, accetta i comandi numerati e invia snapshot a 30 Hz. `apps/web` usa Phaser, riconcilia gli input con gli snapshot del server e disegna tutti i giocatori, i nickname, le piattaforme e il terreno allo stesso tick della simulazione locale.

```sh
npm test
npm run test:campaign:online
npm run build
npx playwright install chromium
# Con npm start in un altro terminale
npm run test:browser
```

Il test browser apre due sessioni Chromium separate, crea una stanza, verifica il movimento dell’altro personaggio e ricarica una pagina per controllare la riconnessione. Una seconda prova ripristina un salvataggio sulla mappa e verifica che entrambi i browser registrino l’uscita del Palazzo Giallo quando un giocatore preme l’interruttore in un’altra stanza. `tests/multiplayer-eight.test.ts` verifica il roster da otto giocatori, il rifiuto del nono ingresso e la migrazione dei salvataggi precedenti. Le schermate browser sono in `test-results/`. I test del simulatore esercitano anche checkpoint, vite, porte, tubi, chiavi, interruttori e salvataggi. I replay in `tests/course-inputs.json` percorrono 13 corsi ciascuno dal proprio ingresso, inclusi tutti i livelli di Yoshi’s Island, Iggy e la Back Door fino alla sconfitta di Bowser. Il replay del finale verifica anche la durata dei titoli di coda.

I replay in `tests/coop-routes` percorrono le **72 uscite normali e le 24 segrete** con i controller di Mario e Luigi. La prova cumulativa parte da una mappa nuova, raccoglie potenziamenti nel gioco, attiva i quattro palazzi e conserva in ordine uscite, vite e risorse. Include il minigioco bonus e il rientro dopo un Game Over. I due percorsi aggiuntivi dalla Front Door e dalla Back Door arrivano a Bowser e mantengono il contatore a 96.

`npm run test:campaign:online` ripete la campagna con due client WebSocket locali. A ogni ingresso entrambi ricevono il salvataggio automatico e una nuova stanza lo riprende, così la registrazione dei comandi inizia sempre dallo stesso fotogramma. Il test confronta i progressi ricevuti dai due client a ogni tappa. In Chromium la prova riapre anche il salvataggio finale da **Riprendi campagna salvata · 96 uscite**, torna sulla mappa con Luigi e avvia un altro corso con Mario. Le registrazioni dei corsi usano triple `[pulsanti Mario, pulsanti Luigi, fotogrammi]`. L’ordine delle visite è in `tests/coop-routes/campaign.json`.

La cartuccia fornisce 235 stanze dagli slot principali, cinque varianti condizionali di Chocolate Island 2 e sei scene di ingresso. Il motore web reimplementa i comportamenti. Alcuni nemici condividono routine di movimento, le arene e i boss hanno differenze rispetto allo SNES e le tracce musicali sono registrazioni con ripetizione.

## Due computer sulla rete privata

Avvia il server sul computer che ospita la partita, indicando l’interfaccia di rete e la porta. Il comando seguente apre la porta 8787 sulle interfacce del computer.

```sh
HOST=0.0.0.0 PORT=8787 npm start
```

Fino a otto account membri della stessa campagna possono giocare via LAN. Per uno stack già preparato, avvia `npm start`; prima applica le migrazioni con `npm run db:migrate:deploy` e configura database, SMTP e `PUBLIC_APP_URL` tramite l’ambiente. Con un reverse proxy HTTPS, inoltra anche l’upgrade WebSocket su `/ws`, conserva l’header `Host` e configura l’accesso privato sul proxy o sulla VPN. Il codice stanza collega i membri autorizzati alla sessione attiva.
