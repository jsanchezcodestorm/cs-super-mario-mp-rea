# Specifica tecnica — account, campagne condivise e classifica

**Stato:** implementata nel checkout locale; login Microsoft tramite Platform Auth e profilo dedicato local stack integrati
**Data:** 18 novembre 2026
**Ambito:** Super Mario MP

## 1. Valutazione iniziale e situazione implementata

La richiesta è realizzabile e ha una motivazione concreta: la progressione oggi non ha un archivio centrale, quindi account, campagne condivise e classifica richiedono una persistenza server-side. Ha senso costruire queste funzionalità sui moduli NestJS esistenti.

Prima di questa implementazione, nel checkout:

- `apps/server` è un workspace TypeScript su Node.js organizzato in moduli NestJS. `NodeAdapter` gestisce HTTP; `WsAdapter` con `ws` gestisce `/ws`.
- `apps/server/src/multiplayer/lobby.ts` e `room.ts` gestiscono stanze e simulazione in memoria. L’identità e il nickname arrivano oggi dal client.
- `apps/web/src/session/save.ts` salva gli slot delle campagne in IndexedDB nel browser. Le stanze attive vivono nel processo server.
- `packages/core` contiene una simulazione deterministica, modalità singolo/cooperativa e un punteggio individuale per giocatore; le stanze supportano fino a otto giocatori.
- `CampaignSave` conserva progressi e risorse, ma non l’intero stato dinamico del livello. Dopo un’interruzione in corso, il gioco riparte dall’ultimo checkpoint salvato o dall’inizio del corso.
- Non risultavano un sistema di account, PostgreSQL, Prisma o API applicative nel backend.

La migrazione NestJS era già stata realizzata e mantiene il wire protocol v1. Questa implementazione aggiunge account, sessioni autenticate, PostgreSQL/Prisma, campagne condivise, risultati e classifica. L’implementazione non cambia la generazione del wire protocol: client e server continuano a usare `v: 1`.

Il client Prisma si genera e `npm run build` completa type-check server e build web. I sei test mirati di Platform Auth passano; il profilo local stack è avviato con un volume PostgreSQL Mario nuovo e le migrazioni sono state applicate senza riutilizzare o cancellare il vecchio volume. Le route HTTP protette e il logout CSRF sono stati verificati. La suite completa non è risultata verde: sono state osservate asserzioni di replay/gameplay fallite e la prova è stata interrotta durante test lunghi. L’Auth locale espone ancora soltanto il provider `local`; il ritorno browser da Microsoft resta da verificare dopo l’attivazione di `entra-id`.

## 2. Obiettivo e regole di prodotto implementate

Un’identità Platform Auth con membership attiva identifica la persona tra dispositivi e sessioni. L’account possiede un nickname stabile; il personaggio Mario o Luigi continua invece a essere scelto per ogni partita.

Una **campagna** è uno slot persistente con proprietario, partecipanti e salvataggio condiviso. Una **sessione di gioco** è una singola esecuzione, in modalità singolo o cooperativa, registrata separatamente dalla campagna. Una stanza e il relativo codice di ingresso restano strumenti temporanei per collegare i giocatori alla sessione attiva.

Regole di prodotto implementate:

1. L’accesso usa Microsoft Entra ID tramite Platform Auth con provider OIDC `entra-id`; il backend richiede una membership attiva per il product code `super-mario-mp`. Il prodotto non implementa un provider di autenticazione proprio.
2. Al primo accesso Microsoft, l’utente sceglie un nickname univoco per creare il profilo di gioco. Il server associa il profilo all’UUID dell’identità Platform Auth; non esistono registrazione, password, verifica email o reset locali.
3. Il nickname è lungo 1–24 caratteri, univoco senza distinzione tra maiuscole e minuscole e modificabile dal profilo. Il nickname corrente appare in lobby e classifica; lo storico delle sessioni conserva anche il nickname usato all’avvio.
4. L’identificatore UUID dell’account diventa l’identità stabile del giocatore nel percorso autenticato. Sostituisce il profilo casuale custodito nel browser. Mario/Luigi resta una scelta di sessione.
5. Le campagne cooperative sono condivise tra account invitati, supportano da 2 a 8 partecipanti per sessione e hanno un solo proprietario. Solo una sessione alla volta può modificare una campagna. Le campagne personali in singolo restano private.
6. Le classifiche mostrano due misure individuali: punti guadagnati e miglior progresso. Il progresso è il numero di uscite distinte completate, fino a 96; il gioco ha percorsi ramificati e non fornisce un singolo ordinamento lineare dei livelli.
7. Sono classificabili solo risultati prodotti dalla simulazione server-side. Sessioni di modalità singolo e cooperativa hanno filtri separati; non si sommano i punti del gruppo e non si accredita progresso ai membri che non hanno partecipato alla sessione.

## 3. Architettura di destinazione

### Backend NestJS

Estendere i moduli NestJS esistenti mantenendo `packages/core` indipendente dal framework. Il backend usa `@nestjs/platform-node` con `NodeAdapter` per il trasporto `node:http` e un adapter WebSocket sottile per il protocollo JSON `{ v: 1, type, ... }`. Il parser/serializer impedisce che i messaggi Nest `{ event, data }` diventino un formato visibile al client.

Comporre il server in moduli piccoli con responsabilità distinte:

| Modulo | Responsabilità |
| --- | --- |
| `PrismaModule` | Un solo client Prisma gestito dal lifecycle NestJS. |
| `PlatformAuthModule` | Adapter same-origin verso Platform Auth per avvio OIDC Microsoft, sessione, CSRF, logout e verifica membership. |
| `AccountsModule` | Profilo di gioco associato all’identità Auth e nickname univoco. |
| `CampaignsModule` | Campagne, autorizzazioni, membri, salvataggi e inviti. |
| `GameSessionsModule` | Sessioni persistenti e partecipanti; coordina l’avvio e la chiusura. |
| `MultiplayerModule`, `WebSocketModule`, `RuntimeModule` | Handshake autenticato, stanze temporanee, input, snapshot e loop di simulazione. |
| `LeaderboardModule` | Classifiche e cronologia personale. |

Il `GameRuntimeService` esistente avanza le stanze attive a 60 tick/s. Un registro in memoria contiene lo stato runtime delle partite attive; con persistenza, non diventerà la fonte autorevole dei salvataggi. Controller, gateway, persistenza e presentazione restano in moduli distinti.

Il client di gioco resta sullo stack web presente. La lobby riceve l’identità già autenticata dal server e non richiede più un nickname per entrare. Le nuove viste di account, elenco/dettaglio campagne, inviti, cronologia e classifica vanno composte in schermate e componenti riusabili, mantenendo il renderer Phaser separato dalla UI accessibile in DOM.

### PostgreSQL e Prisma

PostgreSQL è la fonte durevole per profili di gioco, campagne e risultati; l’identità e le membership restano in Platform Auth. Prisma gestisce schema, accesso dati e transazioni; le modifiche strutturali passano da migrazioni versionate. Il profilo local stack usa PostgreSQL 17 dedicato e volume persistente separato. Il database Mario parte vuoto e non importa account o dati di gioco dal volume locale precedente, che resta inattivo e non viene cancellato. `.env.example` documenta le variabili; `.env` è locale e ignorato da Git.

La colonna JSONB del salvataggio ospita il documento `CampaignSave` prodotto da `makeSave`. I campi usati per autorizzazioni, filtri, aggregazioni e ordinamento della classifica rimangono colonne o relazioni normalizzate: la classifica non deve scansionare né interpretare il JSON del motore.

Modelli logici proposti:

| Modello | Dati principali e vincoli |
| --- | --- |
| `Account` | UUID uguale all’identità Platform Auth, nickname e chiave nickname normalizzata univoca, date di creazione/aggiornamento. Email e sessione arrivano da Platform Auth; il database di gioco non conserva password, challenge email o sessioni Auth. |
| `Campaign` | UUID, proprietario, nome, modalità (`SOLO`/`COOP`), `saveState` JSONB, versione del formato salvataggio, versione dei contenuti di gioco, revisione monotona e date. |
| `CampaignMember` | Relazione univoca campagna/account, ruolo (`OWNER`/`MEMBER`) e data di ingresso. |
| `CampaignInvite` | Hash del token casuale, campagna, autore, scadenza, revoca, usi e limite d’uso. Il token in chiaro compare solo nel link consegnato al creatore. |
| `GameSession` | UUID, campagna, modalità, stato (`ACTIVE`, `COMPLETED`, `INTERRUPTED`, `ABANDONED`), motivo di chiusura, avvio, ultimo salvataggio durevole e chiusura. `COMPLETED` indica uscita volontaria o finale raggiunto; `INTERRUPTED` indica arresto non ordinato; `ABANDONED` indica sessione chiusa dopo la scadenza della riconnessione. |
| `GameSessionParticipant` | Sessione/account, personaggio scelto, nickname alla partenza, punteggio iniziale, ultimo punteggio accreditato, punti guadagnati e uscite completate raggiunte. Vincolo univoco sessione/account. |
| `GameSessionCheckpoint` | Sequenza e revisione persistite con hash del salvataggio; rende idempotenti i retry dei commit. |

Vincoli aggiuntivi: foreign key con cancellazione esplicita, indici per campagne per account e classifiche per modalità/punti/progresso, un solo proprietario per campagna e una sola sessione attiva per campagna. La sessione attiva è protetta da un indice univoco parziale PostgreSQL mantenuto nelle migrazioni Prisma. Gli inviti scaduti o revocati non concedono accesso. L’accettazione di un invito e la creazione dell’appartenenza avvengono nella stessa transazione.

## 4. Accesso Microsoft e autorizzazione

1. La UI avvia il provider OIDC `entra-id` attraverso `GET /api/auth/oidc/entra-id/start`, same-origin. L’app passa il product code `super-mario-mp` e un `returnTo` limitato all’origine configurata di Super Mario MP.
2. Platform Auth gestisce il flusso Entra ID, i cookie OIDC e la sessione condivisa. Il browser usa solo endpoint same-origin del prodotto; il backend inoltra ad Auth i cookie e l’header CSRF strettamente necessari.
3. Ogni richiesta REST o upgrade WebSocket risolve la sessione tramite `GET /auth/session` e richiede la membership attiva `super-mario-mp`. Gli ID utente arrivano soltanto dall’identità verificata sul server.
4. Al primo login senza profilo di gioco, `GET /api/v1/me` restituisce `null`. L’utente sceglie il nickname con `PUT /api/v1/me`; il server salva il profilo sotto l’UUID Platform Auth. Il nickname è lungo 1–24 caratteri e univoco senza distinzione tra maiuscole e minuscole.
5. Le mutazioni same-origin sono protette da CSRF e gli upgrade WebSocket richiedono sessione e profilo. Se Platform Auth non è raggiungibile, il backend rifiuta l’accesso senza autenticazione locale alternativa.

La membership OIDC per il product code è fornita dal provisioning configurato in Platform Auth. Il provider `entra-id` deve essere attivo nell’ambiente locale e l’auto-provisioning deve includere `super-mario-mp`.

## 5. Campagne, partite e salvataggi

### Flusso di condivisione

1. Un utente crea una campagna. Il server assegna proprietario e modalità, genera lo stato iniziale con `packages/core` e salva subito la prima revisione in PostgreSQL.
2. Il proprietario crea un invito revocabile con scadenza. Il link invita l’utente ad accedere con Microsoft; l’accettazione associa il profilo di gioco membro della campagna.
3. Per giocare, il client chiede al server una sessione sulla campagna. Il server controlla appartenenza e modalità, carica il salvataggio e crea la stanza runtime.
4. Ogni partecipante autenticato sceglie Mario o Luigi. ID e nickname arrivano dal contesto account server-side; il client non può sostituirli con valori arbitrari.
5. Il codice della stanza identifica la connessione temporanea. Non concede da solo accesso persistente alla campagna e non sostituisce l’invito.
6. All’uscita dalla sessione, il server registra lo stato finale e i risultati dei soli partecipanti. La campagna può essere ripresa in una nuova stanza da un membro autorizzato.

### Persistenza e consistenza

Il server carica e valida `CampaignSave` con la logica esistente prima di creare una sessione. Salva una nuova revisione alla creazione, a checkpoint, cambi di fase, uscite, Game Over/finale, uscita ordinata e al massimo ogni 30 secondi durante una sessione attiva. Il salvataggio periodico limita la perdita delle risorse e del punteggio personale; non memorizza la posizione o tutti gli oggetti del livello.

Ogni commit aggiorna nella stessa transazione il salvataggio della campagna, la revisione e i dati di sessione/partecipanti che dipendono da quel punto. Gli aggiornamenti usano revisione attesa o lock della riga per rifiutare scritture concorrenti. Il server invia ai client la conferma di salvataggio solo dopo il commit. Una chiave idempotente per evento/revisione impedisce accrediti doppi dopo una riconnessione.

Se PostgreSQL non è raggiungibile all’avvio, la sessione non parte. Se un commit necessario fallisce durante una partita, la sessione viene messa in pausa e i client ricevono un errore; il server non conferma né classifica dati non persistiti. Al riavvio, le sessioni rimaste `ACTIVE` diventano `INTERRUPTED` e la campagna riparte dall’ultimo `CampaignSave` durevole. Riprendere esattamente dal fotogramma dell’interruzione richiederebbe un nuovo formato versionato per il `GameState` completo; non rientra in questa prima specifica.

Una campagna non può essere giocata contemporaneamente in due stanze, perché entrambe partirebbero dalla stessa revisione e produrrebbero progressi incompatibili. La prima versione mantiene un’unica istanza applicativa NestJS per le sessioni runtime; l’aumento a più istanze richiede coordinamento distribuito dello stato attivo, non solo PostgreSQL.

## 6. Risultati e classifica

- La fonte del punteggio è `GameState.players[accountId].score`, calcolato dalla simulazione server. Il client non invia un totale da accreditare.
- A ogni checkpoint durevole, il server accredita la differenza dal punteggio già salvato per quel partecipante. `lastCreditedScore` e `pointsEarned` si aggiornano nella stessa transazione della campagna, così un retry non duplica i punti.
- La classifica punti somma `pointsEarned` per account e modalità (`SOLO` o `COOP`). In cooperativa i punti restano personali, secondo il giocatore a cui il motore ha assegnato ciascun premio.
- Il progresso classifica usa il massimo numero di uscite distinte completate osservato durante le sessioni a cui l’account ha partecipato, da 0 a 96. L’app può mostrarlo come `N / 96` invece di definire arbitrariamente un “livello più alto”.
- La cronologia mostra per sessione modalità, campagna, orari, stato, punti guadagnati e progresso osservato. L’email resta privata; le viste pubbliche mostrano il nickname corrente.
- Partite importate da IndexedDB non attribuiscono punti storici alla classifica. I valori importati non sono verificabili come risultati server-side.

## 7. Contratti applicativi

Le API applicative usano il prefisso `/api/v1`. Il browser parla con gli endpoint same-origin del prodotto; account e campagne richiedono una sessione Platform Auth con membership attiva.

| Endpoint | Uso |
| --- | --- |
| `GET /api/session` | Espone la sessione Platform Auth corrente o `user: null`. |
| `GET /api/auth/csrf` | Ottiene il cookie e il token CSRF di Platform Auth. |
| `GET /api/auth/oidc/entra-id/start?returnTo=…` | Avvia il login Microsoft con product code e ritorno same-origin. |
| `POST /api/auth/logout` | Termina la sessione Platform Auth corrente con CSRF. |
| `GET /api/v1/me` | Legge il profilo di gioco dell’identità corrente, o restituisce `null` al primo login. |
| `PUT /api/v1/me` | Crea o aggiorna il nickname; l’identità non è accettata dal client. |
| `GET, POST /api/v1/campaigns` | Elenca le campagne accessibili o ne crea una. |
| `GET /api/v1/campaigns/:id` | Legge dettagli e membri se l’account è membro. |
| `POST /api/v1/campaigns/:id/invites` | Crea un invito per il proprietario. |
| `POST /api/v1/campaign-invites/:token/accept` | Accetta l’invito e registra l’appartenenza. |
| `POST /api/v1/campaigns/import` | Importa una campagna IndexedDB con validazione e chiave di idempotenza. |
| `GET /api/v1/me/sessions` | Legge la cronologia personale paginata. |
| `GET /api/v1/leaderboard?metric=points\|progress&mode=solo\|coop` | Legge la classifica paginata, senza dati email. |

Il tag wire WebSocket resta `v: 1`, come deciso per questo checkout. La creazione/ingresso stanza non accetta più `profileId`, nickname, `CampaignSave` o riferimenti campagna forniti dal browser: riceve un `campaignId` autorizzato e il personaggio; l’account e il salvataggio sono risolti dal server. La modalità singolo usa lo stesso motore server-side con un partecipante, per poter registrare risultati attendibili. Il contratto dei campi è cambiato, quindi client e server vanno distribuiti insieme anche se la generazione resta v1.

## 8. Migrazione dei salvataggi esistenti e rilascio

I salvataggi correnti sono slot in IndexedDB e alcune risorse sono indicizzate con l’ID profilo generato nel browser. Non esiste una corrispondenza affidabile tra tutti quegli ID e gli account futuri.

Prevedere un’importazione esplicita di una campagna locale: il server valida struttura e contenuti, crea una campagna associata all’account che importa e conserva la copia locale finché il server non conferma l’operazione. In cooperativa il proprietario deve confermare come associare le vecchie risorse personali ai nuovi account; le risorse non ancora assegnate restano preservate nel payload importato e non vengono attribuite a una persona. L’importazione non accredita la classifica.

Sequenza di rilascio proposta:

1. Portare HTTP, file statici, health check e WebSocket in NestJS preservando i comportamenti esistenti e il motore `packages/core`.
2. Introdurre schema Prisma e migrazioni PostgreSQL, configurazione sicura e backup automatici con procedura di ripristino verificata.
3. Integrare Platform Auth con login Microsoft, sessione e membership attiva; distribuire client e server insieme mantenendo il tag wire WebSocket v1.
4. Aggiungere campagne condivise, inviti, salvataggio server-side e sessioni server-authoritative.
5. Aggiungere cronologia, aggregazioni e classifica; abilitare l’importazione dei salvataggi locali.

I vecchi client WebSocket v1 non sono compatibili con i nuovi campi e con l’autenticazione obbligatoria: il rilascio va coordinato tra client e server, senza introdurre il tag v2. I vecchi dati locali non vengono cancellati dal browser durante il rilascio.

## 9. Verifiche

In questo intervento `npm run build` è passato e i sei test mirati `tests/platform-auth.test.ts` passano. Sono stati verificati sessione/membership, assenza sessione e Auth non raggiungibile, avvio OIDC e vincolo di `returnTo`, logout CSRF, guardie REST/WebSocket e associazione del nickname all’identità Auth. Il local stack ha avviato Super Mario MP con il database dedicato nuovo; health, route pubblica, sessione anonima, endpoint protetti e logout CSRF hanno risposto come previsto. `check-paths`, `profiles` e build wiki sono passati.

La suite completa `npm test` non è stata certificata: sono emerse asserzioni fallite in test di replay/gameplay e la sessione di test è stata interrotta durante test lunghi. L’Auth locale espone al momento solo il provider `local`, quindi il ritorno reale dal provider Microsoft, l’onboarding in browser e il flusso autenticato campagne/WebSocket restano da verificare dopo l’attivazione di `entra-id`.

Restano inoltre da eseguire prima del rilascio i playtest di gameplay, i casi end-to-end su campagne/inviti/sessioni e la verifica di backup/ripristino PostgreSQL in un ambiente dedicato.

## 10. Configurazione operativa ancora necessaria

1. Attivare `entra-id` nella configurazione protetta di Platform Auth locale e assicurare il provisioning della membership `super-mario-mp`; poi verificare redirect URI, ritorno al dominio Mario, creazione profilo e logout da browser.
2. Configurare in produzione il provider Microsoft, l’origine pubblica, cookie HTTPS, membership/provisioning e criteri di accesso al prodotto.
3. Definire conservazione/cancellazione dei dati e obiettivi di backup; provare backup e ripristino PostgreSQL prima del rilascio.

## Riferimenti tecnici

- [NestJS — HTTP adapters e NodeAdapter](https://docs.nestjs.com/techniques/performance)
- [NestJS — WebSocket adapters e formato dei messaggi `WsAdapter`](https://docs.nestjs.com/websockets/adapter)
- [Prisma ORM — modellazione dati e campi JSON/JSONB](https://www.prisma.io/docs/orm/data-modeling?db=postgresql)
- [Prisma ORM — transazioni](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)
- [Prisma ORM — migrazioni](https://www.prisma.io/docs/orm/migrations/how-migrations-work)
