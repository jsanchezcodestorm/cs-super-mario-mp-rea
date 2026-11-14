# Impatti di una migrazione del backend a NestJS

**Stato:** porting implementato; build e type-check superati, test d’integrazione non eseguiti<br>
**Riferimento:** checkout locale osservato il 14 novembre 2026<br>
**Perimetro:** backend di `super-mario-mp` e contratto WebSocket v1; gameplay e formato dei salvataggi invariati

## Sintesi

La migrazione a NestJS è realizzata senza riscrivere il motore di gioco. Il wire protocol è stato portato alla versione 1 mantenendo i campi e i tipi dei messaggi attuali; client e server vengono aggiornati insieme e non viene mantenuta compatibilità con v2, perché non ci sono consumer in produzione. L’impatto principale riguarda bootstrap, composizione dei servizi, lifecycle, integrazione WebSocket e test d’integrazione.

NestJS non aggiunge funzionalità di gioco. Il server è organizzato in moduli e provider, con dependency injection e punti d’estensione per future API. Il client e il server usano ora il tag wire `v: 1`.

Questa valutazione non contiene una stima di giorni o costi, come richiesto.

## Base di verifica pre-porting

Questa sezione riporta la base osservata prima del porting: backend Node.js e TypeScript, requisito runtime Node.js `>=24`, avvio TypeScript con `tsx` e dipendenze server `ws`, `@smw/core` e `@smw/protocol`. Il package non conteneva dipendenze NestJS.

Il checkout iniziale conteneva modifiche locali a lobby, stanza, server statico, avvio e test; le osservazioni descrivevano quei sorgenti e non una baseline ricostruita da `HEAD`.

Riferimenti correnti dopo il porting:

- [package.json](../../package.json) e [apps/server/package.json](../../apps/server/package.json): workspaces, script, versione Node e dipendenze NestJS.
- [apps/server/tsconfig.json](../../apps/server/tsconfig.json): configurazione TypeScript per i decorator NestJS.
- [apps/server/src/app.module.ts](../../apps/server/src/app.module.ts) e [create-application.ts](../../apps/server/src/create-application.ts): composizione dei moduli e bootstrap.
- Le cartelle [config](../../apps/server/src/config), [campaign](../../apps/server/src/campaign), [multiplayer](../../apps/server/src/multiplayer), [runtime](../../apps/server/src/runtime), [websocket](../../apps/server/src/websocket) e [http](../../apps/server/src/http) contengono i moduli per responsabilità.
- [packages/protocol/src/index.ts](../../packages/protocol/src/index.ts), [apps/web/src/session/connection.ts](../../apps/web/src/session/connection.ts) e [apps/server/src/multiplayer/lobby.ts](../../apps/server/src/multiplayer/lobby.ts): validazione condivisa e uso del wire protocol v1.
- [tests/gateway.test.ts](../../tests/gateway.test.ts) e [tests/coop/socket-room.ts](../../tests/coop/socket-room.ts): test d’integrazione Nest e test diretti della lobby.

## Backend prima del porting

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
| Gateway WebSocket | Collegare l’adapter `ws` e instradare i messaggi ricevuti al codice della lobby. | `/ws` e la forma JSON dei messaggi restano invariati; il tag wire è `v: 1`. |
| Messaggi in uscita | Preservare gli invii server-initiated e la serializzazione attuale: snapshot, eventi, stato della stanza, errori e salvataggi. | Un involontario wrapper Nest `{ event, data }` cambierebbe il protocollo e richiederebbe modifiche al client. |
| Connessione e sicurezza | Reimplementare in modo esplicito controllo dell’Origin, path `/ws`, massimo payload, rifiuto dei frame binari, backpressure, ping/pong e chiusura dei socket. | Il comportamento di ammissione, i limiti e i codici di chiusura restano compatibili. |
| Loop e shutdown | Spostare timer di simulazione e heartbeat in un servizio con lifecycle NestJS; interromperli allo shutdown e chiudere stanze e socket. | Rimane un solo loop attivo per processo; non si duplicano tick in sviluppo, test o shutdown. |
| File statici e health check | Mantenere le risposte attuali o adattare l’handler esistente come middleware/servizio compatibile con Nest. | `/`, `/trace`, `/assets` e `/health` continuano a funzionare con le stesse regole per range, HEAD, gzip e contenimento dei percorsi. |
| Build e avvio | Aggiornare gli script `start`, `dev`, `build` e il type-check; definire come produrre o eseguire il server TypeScript. | `npm start`, lo stack Vite locale e l’avvio sul server devono continuare a usare la stessa porta e lo stesso contratto di hosting. |
| Test d’integrazione | Adattare il test che crea `createGateway` direttamente e aggiungere la creazione dell’app Nest per le prove HTTP/WebSocket. | Le prove di trasporto passano attraverso il nuovo bootstrap; non è necessario avviare Nest per ogni test di simulazione. |

### Scelta dell’adapter HTTP

Le guide ufficiali NestJS descrivono `NodeAdapter` per eseguire Nest direttamente sopra `node:http` e indicano Express come default quando l’adapter non viene specificato. Usare esplicitamente `NodeAdapter` evita di introdurre Express solo per ospitare le route HTTP.

### Compatibilità dell’adapter WebSocket

NestJS fornisce `WsAdapter` tramite `@nestjs/platform-ws`, compatibile con WebSocket nativi del browser. Il parser personalizzato mappa il frame in un evento Nest interno e passa alla lobby il JSON v1 originale. Nessun wrapper `event`/`data` viene esposto al client.

Inoltre, il server invia diversi messaggi autonomamente durante la partita. Un gateway che si limita a restituire il risultato del singolo handler non copre da solo questo comportamento: occorre conservare un canale di invio diretto al socket o implementare una serializzazione/adattatore che mantenga i messaggi server-initiated e il loro formato.

Riferimenti ufficiali:

- [WebSocket adapter NestJS](https://docs.nestjs.com/websockets/adapter)
- [WebSocket gateways NestJS](https://docs.nestjs.com/websockets/gateways)
- [Adapter HTTP NestJS](https://docs.nestjs.com/techniques/performance)

## Parti che possono restare invariate

- `packages/core` può continuare a contenere simulazione deterministica e regole di gioco senza dipendenze NestJS.
- `packages/protocol` mantiene tipi e validazione condivisi per il wire protocol v1.
- Il client web invia e accetta v1; path `/ws`, origin e campi dei messaggi restano invariati.
- Le classi `Lobby`, `Room` e `Seat` possono mantenere le responsabilità di dominio. Nest dovrebbe comporle e coordinarle, non accorpare tutta la logica in un singolo gateway.
- I salvataggi locali del browser, il formato del salvataggio e le regole multiplayer non richiedono modifiche per il solo cambio di framework.
- Non emerge la necessità di un database, Redis o un altro servizio esterno per completare il porting. Tali servizi sarebbero decisioni separate per persistenza o coordinamento tra istanze.

## Impatto sui test esistenti

`tests/gateway.test.ts` avvia l’app Nest reale e controlla l’endpoint WebSocket, il controllo dell’Origin, il path, i frame binari, il limite del payload, la riconnessione, il roster, gli snapshot e le risposte HTTP.

`tests/coop/socket-room.ts` crea invece direttamente `Lobby` e `WebSocketServer` per controllare la simulazione con un clock di test. La lobby resta invocabile senza bootstrap Nest per preservare test deterministici e rapidi.

Le verifiche richieste sono elencate nella sezione “Criteri di accettazione del porting”. Non sono state eseguite in questa sessione.

## Rischi tecnici da gestire

1. **Cambio involontario del protocollo:** il rischio principale è introdurre wrapper o risposte automatiche Nest intorno ai messaggi JSON attuali.
2. **Handshake con regole diverse:** il controllo dell’Origin deve avvenire prima di accettare la connessione, non dopo aver elaborato un messaggio applicativo.
3. **Loop duplicato:** il tick deve essere avviato una sola volta per processo e fermato durante shutdown e teardown dei test.
4. **Regressione degli asset:** un modulo statico generico potrebbe cambiare risposte `Range`, intestazioni, gzip, route `/trace` o protezione dai path traversal.
5. **Confusione tra gateway e dominio:** le regole di stanza e simulazione devono restare in unità coese e riutilizzabili; i gateway Nest devono limitarsi al trasporto e alla composizione.
6. **Sovrastima delle garanzie operative:** NestJS non rende persistenti le stanze e non rende automaticamente sicura la condivisione dello stato tra repliche.
7. **Prestazioni non misurate:** il loop di gioco e la frequenza di messaggistica restano gli stessi, ma l’effetto dell’instradamento Nest sul carico non è deducibile dalla sola ispezione del codice. Se il carico è una preoccupazione, va misurato con lo stesso scenario prima e dopo.

## Struttura implementata

Il server è diviso in moduli Nest per responsabilità:

- `config/`: configurazione runtime condivisa.
- `campaign/`: caricamento e validazione della campagna generata.
- `multiplayer/`: `Lobby`, `Room`, `Seat` e regole di sessione.
- `runtime/`: loop a 60 tick/s, heartbeat e arresto ordinato.
- `websocket/`: gateway Nest e adapter `ws` con parser per il wire protocol v1.
- `http/`: controller `/health` e handler statico con le garanzie correnti.
- `app.module.ts`: composizione dei moduli; `create-application.ts` e `main.ts` gestiscono bootstrap e configurazione dell’istanza.

Se si vuole rendere anche la logica delle stanze indipendente da `ws`, si può introdurre un’interfaccia minima per la connessione e l’invio dei messaggi. È un’ulteriore separazione architetturale, non un prerequisito per usare NestJS con `WsAdapter`.

## Criteri di accettazione del porting

- `npm start` e `npm run dev` avviano l’applicazione con `HOST`, `PORT` e `WEB_ORIGIN` attesi.
- Il client continua a collegarsi a `/ws` e invia/riceve i payload versione 1, con gli stessi campi dei messaggi e senza wrapper Nest osservabili.
- Origini ammesse e rifiutate, path diverso da `/ws`, frame binari e messaggi oltre il limite hanno esiti equivalenti.
- Creazione stanza, roster, avvio host, input, snapshot, riconnessione, pausa, scadenza e chiusura conservano lo stesso comportamento.
- Il loop continua a produrre 60 tick/s e snapshot ogni due tick quando la stanza è attiva; si ferma correttamente quando la stanza è in pausa o il processo si arresta.
- Le risposte HTTP per root, `/trace`, `/assets`, `/health`, richieste `HEAD`, `Range` valido/non valido e file inesistenti restano compatibili.
- I test della simulazione continuano a poter esercitare direttamente lobby e stanze; un test d’integrazione avvia invece il vero bootstrap Nest.
- La prova browser cooperativa verifica che i due client completino il collegamento, ricevano snapshot coerenti e possano riconnettersi.

## Valutazione finale

Il porting è circoscritto al backend e all’aggiornamento coordinato del tag wire a v1; non richiede una riscrittura del gameplay. Restano da eseguire le verifiche automatiche e il playtest browser descritti nei criteri. I punti di maggior attenzione sono il contratto WebSocket, il ciclo di vita dei timer e le particolarità del server statico.

L’adozione ha senso per organizzare moduli applicativi in crescita, future API HTTP e integrazioni Nest. Poiché non ci sono consumer in produzione, la migrazione mantiene il protocollo in v1 senza un percorso di compatibilità v2.
