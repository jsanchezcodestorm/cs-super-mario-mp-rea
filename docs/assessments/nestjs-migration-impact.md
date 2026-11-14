# Impatti di una migrazione del backend a NestJS

**Stato:** valutazione tecnica, non implementata<br>
**Riferimento:** checkout locale osservato il 14 novembre 2026<br>
**Perimetro:** backend di `super-mario-mp`; nessuna modifica applicativa inclusa

## Sintesi

La migrazione a NestJS è tecnicamente realizzabile senza riscrivere il motore di gioco e senza cambiare il protocollo client-server, purché il nuovo gateway mantenga i messaggi WebSocket correnti. L’impatto riguarda soprattutto bootstrap, composizione dei servizi, gestione del ciclo di vita, integrazione WebSocket e test d’integrazione.

Nel codice attuale NestJS non aggiungerebbe nuove funzionalità di gioco. Porterebbe una struttura a moduli e provider, dependency injection e punti d’estensione standardizzati. L’opportunità dipende quindi dal valore di uniformare l’architettura o preparare nuove API e moduli applicativi.

Questa valutazione non contiene una stima di giorni o costi, come richiesto.

## Base di verifica

Il backend è un workspace Node.js e TypeScript. Il requisito runtime è Node.js `>=24`; gli script avviano TypeScript con `tsx`. Il package del server dipende da `ws` e dai workspace `@smw/core` e `@smw/protocol`; non contiene dipendenze NestJS.

Il checkout contiene modifiche locali non committate, incluse modifiche ai file di lobby, stanza, server statico, avvio e test. Le osservazioni descrivono quindi i sorgenti presenti nel checkout, non una baseline ricostruita da `HEAD`.

Riferimenti principali:

- [package.json](../../package.json) e [apps/server/package.json](../../apps/server/package.json): workspaces, script, versione Node e dipendenze.
- [apps/server/tsconfig.json](../../apps/server/tsconfig.json): compilazione corrente senza emissione JavaScript e senza opzioni per i decorator NestJS.
- [apps/server/src/main.ts](../../apps/server/src/main.ts): caricamento della campagna generata e avvio del gateway.
- [apps/server/src/gateway.ts](../../apps/server/src/gateway.ts): HTTP, handshake WebSocket, loop di simulazione, heartbeat e arresto.
- [apps/server/src/static.ts](../../apps/server/src/static.ts): health check e pubblicazione di client e asset.
- [apps/server/src/lobby.ts](../../apps/server/src/lobby.ts), [room.ts](../../apps/server/src/room.ts) e [seat.ts](../../apps/server/src/seat.ts): lobby, stato delle stanze, sessioni di gioco e invio messaggi.
- [tests/gateway.test.ts](../../tests/gateway.test.ts) e [tests/coop/socket-room.ts](../../tests/coop/socket-room.ts): prove del gateway reale e prove dirette della lobby.

## Backend attuale

### HTTP e asset

`main.ts` carica i file JSON sotto `generated/`, verifica che il catalogo della campagna sia presente e configura il server con `HOST`, `PORT` e `WEB_ORIGIN`. Il server HTTP creato con `node:http` serve l’applicazione web compilata e gli asset generati sullo stesso indirizzo usato dai WebSocket.

`static.ts` gestisce `GET` e `HEAD`, `/health`, la pagina `/trace`, i file dell’app e `/assets`. Per i file supporta richieste a intervallo di byte, risposte `206` e `416`, compressione gzip per alcuni formati, tipi MIME e controllo dei percorsi reali prima di aprire i file.

### WebSocket e protocollo

`gateway.ts` crea `WebSocketServer` in modalità `noServer` e accetta l’upgrade solo su `/ws`. Controlla l’origine della richiesta, limita i messaggi a 32 KiB e disabilita `perMessageDeflate`.

Il client e il server scambiano messaggi JSON versionati, con la forma generale `{ "v": 2, "type": "..." }`. Il server invia anche aggiornamenti non richiesti dal client, come `snapshot`, `roomState`, `gameEvent` e `save`. Il client apre `/ws` sullo stesso origin; in sviluppo Vite inoltra `/ws` al server locale.

### Simulazione e stato

Il gateway avanza la lobby a 60 tick al secondo e invia heartbeat WebSocket ogni 20 secondi. `Lobby` coordina le stanze; `Room` contiene roster, socket, stato della partita e snapshot; `Seat` gestisce token di rientro, sequenze e input.

Le stanze attive sono in memoria del processo. L’adozione di NestJS non introduce persistenza, ripristino dopo il riavvio o condivisione dello stato tra più istanze.

## Impatti necessari

| Area | Impatto concreto | Effetto se il comportamento attuale viene mantenuto |
| --- | --- | --- |
| Bootstrap e moduli | Aggiungere il bootstrap NestJS, l’`AppModule` e i provider per la configurazione della campagna, la lobby e i servizi di runtime. | L’entry point e gli script di avvio cambiano; `HOST` e `PORT` devono continuare a essere applicati. |
| Dipendenze e TypeScript | Aggiungere i pacchetti NestJS necessari, configurare i decorator e la metadata reflection e aggiornare il lockfile. | Aumentano dipendenze e configurazione del server; il client non ne è interessato. |
| HTTP adapter | Scegliere esplicitamente un adapter HTTP. L’opzione Nest `NodeAdapter` usa `node:http`, già usato dal progetto; il default Nest è Express se non si specifica un adapter. | La scelta dell’adapter determina il middleware disponibile e la compatibilità con l’handler statico esistente. |
| Gateway WebSocket | Collegare l’adapter `ws` e instradare i messaggi ricevuti al codice della lobby. | `/ws` e il protocollo versione 2 possono restare invariati se parsing e invio preservano i messaggi JSON grezzi. |
| Messaggi in uscita | Preservare gli invii server-initiated e la serializzazione attuale: snapshot, eventi, stato della stanza, errori e salvataggi. | Un involontario wrapper Nest `{ event, data }` cambierebbe il protocollo e richiederebbe modifiche al client. |
| Connessione e sicurezza | Reimplementare in modo esplicito controllo dell’Origin, path `/ws`, massimo payload, rifiuto dei frame binari, backpressure, ping/pong e chiusura dei socket. | Il comportamento di ammissione, i limiti e i codici di chiusura restano compatibili. |
| Loop e shutdown | Spostare timer di simulazione e heartbeat in un servizio con lifecycle NestJS; interromperli allo shutdown e chiudere stanze e socket. | Rimane un solo loop attivo per processo; non si duplicano tick in sviluppo, test o shutdown. |
| File statici e health check | Mantenere le risposte attuali o adattare l’handler esistente come middleware/servizio compatibile con Nest. | `/`, `/trace`, `/assets` e `/health` continuano a funzionare con le stesse regole per range, HEAD, gzip e contenimento dei percorsi. |
| Build e avvio | Aggiornare gli script `start`, `dev`, `build` e il type-check; definire come produrre o eseguire il server TypeScript. | `npm start`, lo stack Vite locale e l’avvio sul server devono continuare a usare la stessa porta e lo stesso contratto di hosting. |
| Test d’integrazione | Adattare il test che crea `createGateway` direttamente e aggiungere la creazione dell’app Nest per le prove HTTP/WebSocket. | Le prove di trasporto passano attraverso il nuovo bootstrap; non è necessario avviare Nest per ogni test di simulazione. |

### Scelta dell’adapter HTTP

Le guide ufficiali NestJS descrivono `NodeAdapter` per eseguire Nest direttamente sopra `node:http` e indicano Express come default quando l’adapter non viene specificato. Usare esplicitamente `NodeAdapter` evita di introdurre Express solo per ospitare le route HTTP.

### Compatibilità dell’adapter WebSocket

NestJS fornisce `WsAdapter` tramite `@nestjs/platform-ws`, compatibile con WebSocket nativi del browser. Il formato gestito dai gateway Nest è `event`/`data`; la guida documenta un parser personalizzabile. Poiché il protocollo del gioco usa `type` e include `v: 2`, l’adattamento deve mappare i messaggi senza trasformare la forma osservabile sul wire.

Inoltre, il server invia diversi messaggi autonomamente durante la partita. Un gateway che si limita a restituire il risultato del singolo handler non copre da solo questo comportamento: occorre conservare un canale di invio diretto al socket o implementare una serializzazione/adattatore che mantenga i messaggi server-initiated e il loro formato.

Riferimenti ufficiali:

- [WebSocket adapter NestJS](https://docs.nestjs.com/websockets/adapter)
- [WebSocket gateways NestJS](https://docs.nestjs.com/websockets/gateways)
- [Adapter HTTP NestJS](https://docs.nestjs.com/techniques/performance)

## Parti che possono restare invariate

- `packages/core` può continuare a contenere simulazione deterministica e regole di gioco senza dipendenze NestJS.
- `packages/protocol` può mantenere i tipi e la validazione del protocollo versione 2.
- Il client web, la connessione browser e il proxy `/ws` di Vite non devono cambiare se Nest conserva path, origin e messaggi attuali.
- Le classi `Lobby`, `Room` e `Seat` possono mantenere le responsabilità di dominio. Nest dovrebbe comporle e coordinarle, non accorpare tutta la logica in un singolo gateway.
- I salvataggi locali del browser, il formato del salvataggio e le regole multiplayer non richiedono modifiche per il solo cambio di framework.
- Non emerge la necessità di un database, Redis o un altro servizio esterno per completare il porting. Tali servizi sarebbero decisioni separate per persistenza o coordinamento tra istanze.

## Impatto sui test esistenti

`tests/gateway.test.ts` controlla l’endpoint WebSocket, la riconnessione, il limite di giocatori, gli snapshot e le risposte HTTP con richieste a intervallo e `HEAD`. Va aggiornato affinché avvii l’app Nest reale e chiuda correttamente l’applicazione.

`tests/coop/socket-room.ts` crea invece direttamente `Lobby` e `WebSocketServer` per controllare la simulazione con un clock di test. Questa separazione è utile: mantenere lobby e stanze invocabili senza bootstrap Nest preserva test deterministici e rapidi.

Le verifiche richieste dopo un’implementazione sono elencate nella sezione “Criteri di accettazione”. Non sono state eseguite durante questa valutazione.

## Rischi tecnici da gestire

1. **Cambio involontario del protocollo:** il rischio principale è introdurre wrapper o risposte automatiche Nest intorno ai messaggi JSON attuali.
2. **Handshake con regole diverse:** il controllo dell’Origin deve avvenire prima di accettare la connessione, non dopo aver elaborato un messaggio applicativo.
3. **Loop duplicato:** il tick deve essere avviato una sola volta per processo e fermato durante shutdown e teardown dei test.
4. **Regressione degli asset:** un modulo statico generico potrebbe cambiare risposte `Range`, intestazioni, gzip, route `/trace` o protezione dai path traversal.
5. **Confusione tra gateway e dominio:** le regole di stanza e simulazione devono restare in unità coese e riutilizzabili; i gateway Nest devono limitarsi al trasporto e alla composizione.
6. **Sovrastima delle garanzie operative:** NestJS non rende persistenti le stanze e non rende automaticamente sicura la condivisione dello stato tra repliche.
7. **Prestazioni non misurate:** il loop di gioco e la frequenza di messaggistica restano gli stessi, ma l’effetto dell’instradamento Nest sul carico non è deducibile dalla sola ispezione del codice. Se il carico è una preoccupazione, va misurato con lo stesso scenario prima e dopo.

## Struttura target da valutare

Una decomposizione coerente con il codice corrente sarebbe:

- **Application module:** bootstrap, configurazione, caricamento della campagna e provider condivisi.
- **Game runtime service:** avvio e arresto del loop e dell’heartbeat.
- **WebSocket gateway:** verifica del trasporto e delega dei comandi alla lobby, mantenendo messaggi server-initiated.
- **Lobby e room services:** regole già presenti in `Lobby` e `Room`, isolate dal ciclo di vita Nest quando possibile.
- **Health route:** `/health` con un controller Nest o con l’handler HTTP esistente.
- **Static content handler:** pubblicazione di `apps/web/dist` e `generated` con le stesse garanzie correnti.

Se si vuole rendere anche la logica delle stanze indipendente da `ws`, si può introdurre un’interfaccia minima per la connessione e l’invio dei messaggi. È un’ulteriore separazione architetturale, non un prerequisito per usare NestJS con `WsAdapter`.

## Criteri di accettazione per un eventuale porting

- `npm start` e `npm run dev` avviano l’applicazione con `HOST`, `PORT` e `WEB_ORIGIN` attesi.
- Il client continua a collegarsi a `/ws` e invia/riceve gli stessi payload versione 2, senza modifiche ai messaggi osservabili.
- Origini ammesse e rifiutate, path diverso da `/ws`, frame binari e messaggi oltre il limite hanno esiti equivalenti.
- Creazione stanza, roster, avvio host, input, snapshot, riconnessione, pausa, scadenza e chiusura conservano lo stesso comportamento.
- Il loop continua a produrre 60 tick/s e snapshot ogni due tick quando la stanza è attiva; si ferma correttamente quando la stanza è in pausa o il processo si arresta.
- Le risposte HTTP per root, `/trace`, `/assets`, `/health`, richieste `HEAD`, `Range` valido/non valido e file inesistenti restano compatibili.
- I test della simulazione continuano a poter esercitare direttamente lobby e stanze; un test d’integrazione avvia invece il vero bootstrap Nest.
- La prova browser cooperativa verifica che i due client completino il collegamento, ricevano snapshot coerenti e possano riconnettersi.

## Valutazione finale

Il porting è circoscritto al livello server e non richiede una riscrittura del gameplay. Il punto di maggior attenzione è il mantenimento esatto del contratto WebSocket, seguito dal ciclo di vita dei timer e dalle particolarità del server statico.

L’adozione è sensata se NestJS risponde a un obiettivo architetturale concreto — moduli applicativi in crescita, API HTTP future, convenzioni condivise o integrazione di provider Nest. Se il solo obiettivo è cambiare framework senza un’esigenza architetturale successiva, il codice di gioco e il protocollo resterebbero quasi identici e si aggiungerebbero principalmente bootstrap, adapter e manutenzione del framework.
