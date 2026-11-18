# Super Mario World da solo o in cooperativa

Da uno a otto giocatori possono esplorare la cartuccia europea 1.1 ricostruita per il browser. Le campagne, i progressi e i risultati sono salvati in PostgreSQL; le partite singole e cooperative usano la simulazione server-side. L’accesso usa Microsoft OIDC tramite Platform Auth. Al primo accesso ogni persona sceglie un nickname univoco e poi Mario o Luigi per ogni sessione. In co-op, il proprietario condivide una campagna privata tramite invito.

## Giocare

Il modo consigliato per avviare l’Experience è il profilo dedicato del local stack. Dalla radice di `cs-repository`:

```sh
npm --prefix platform-local-stack run check-paths -- --profile super-mario-mp
npm --prefix platform-local-stack run start:dev -- --profile super-mario-mp
```

Apri [Super Mario MP](http://super-mario-mp.cs.lvh.me:8080). Il profilo avvia Platform Auth, l’app e un PostgreSQL dedicato sulla porta 5442. Il login usa il provider `entra-id` e il product code `super-mario-mp`; l’auto-provisioning OIDC di Platform Auth deve essere attivo. Il primo accesso richiede la scelta del nickname prima di poter aprire campagne o WebSocket.

Per avviare l’Experience da sola servono Node 24+, Docker Compose e un Platform Auth raggiungibile, con il provider Microsoft configurato e la membership del prodotto disponibile:

```sh
npm ci
cp .env.example .env
npm run dev
```

`npm run dev` avvia PostgreSQL sulla porta 5442, genera Prisma Client, applica le migrazioni e avvia API e Vite. Il nuovo volume `smw-postgres-platform-auth` parte vuoto; il volume locale precedente resta inattivo e non viene rimosso. `npm run db:down` ferma il database senza eliminare il volume. Configura `PLATFORM_AUTH_SERVICE_URL`, `PLATFORM_AUTH_PRODUCT_CODE`, `WEB_ORIGIN` e `PUBLIC_APP_URL` per l’ambiente usato.

Non esistono più registrazione, password, verifica email o reset locali: login, sessione, membership e logout sono gestiti da Platform Auth. Il profilo di gioco salva soltanto l’identità Auth e il nickname. Per una stanza co-op, condividi il codice con un account membro della campagna. Una sessione singola viene salvata dal server e compare nella cronologia account.

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

Fino a otto profili membri della stessa campagna possono giocare via LAN. Per uno stack già preparato, avvia `npm start`; prima applica le migrazioni con `npm run db:migrate:deploy` e configura database, `PLATFORM_AUTH_SERVICE_URL`, `PLATFORM_AUTH_PRODUCT_CODE`, `WEB_ORIGIN` e `PUBLIC_APP_URL` tramite l’ambiente. Con un reverse proxy HTTPS, inoltra anche l’upgrade WebSocket su `/ws`, conserva l’header `Host` e configura l’accesso privato sul proxy o sulla VPN. Il codice stanza collega i membri autorizzati alla sessione attiva.
