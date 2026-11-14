# Specifica tecnica — account, campagne condivise e classifica

**Stato:** implementata nel checkout locale; build e configurazione Compose verificate, test e avvio PostgreSQL non eseguiti
**Data:** 14 novembre 2026
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

Il client Prisma si genera correttamente e `npm run build` completa type-check server e build web. `docker compose config --quiet` valida la configurazione locale e un import ESM diretto conferma l’export di `migrateCampaignSave`. Docker Compose definisce PostgreSQL locale e Mailpit; `.env` punta al database e SMTP locali. Le immagini non sono state avviate e le migrazioni non sono state applicate in questa sessione. In produzione resta da configurare il provider SMTP e l’URL pubblico. Non sono stati eseguiti test o playtest.

## 2. Obiettivo e regole di prodotto implementate

Un account verificato identifica la persona tra dispositivi e sessioni. L’account possiede un nickname stabile; il personaggio Mario o Luigi continua invece a essere scelto per ogni partita.

Una **campagna** è uno slot persistente con proprietario, partecipanti e salvataggio condiviso. Una **sessione di gioco** è una singola esecuzione, in modalità singolo o cooperativa, registrata separatamente dalla campagna. Una stanza e il relativo codice di ingresso restano strumenti temporanei per collegare i giocatori alla sessione attiva.

Scelte proposte per rendere il perimetro implementabile:

1. Sono ammessi indirizzi con dominio esattamente `codestorm.it`; il server normalizza l’indirizzo e verifica la proprietà tramite email prima di attivare l’account. Sottodomini e domini con suffissi simili non sono ammessi.
2. La registrazione e il login usano email e password. La registrazione verifica il possesso dell’indirizzo con un link monouso; il recupero password usa un secondo link monouso e revoca le sessioni esistenti dopo la modifica.
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
| `AuthModule` | Registrazione, verifica email, autenticazione email/password, recupero password, cookie e revoca sessioni. |
| `AccountsModule` | Profilo, email privata e nickname. |
| `CampaignsModule` | Campagne, autorizzazioni, membri, salvataggi e inviti. |
| `GameSessionsModule` | Sessioni persistenti e partecipanti; coordina l’avvio e la chiusura. |
| `MultiplayerModule`, `WebSocketModule`, `RuntimeModule` | Handshake autenticato, stanze temporanee, input, snapshot e loop di simulazione. |
| `LeaderboardModule` | Classifiche e cronologia personale. |

Il `GameRuntimeService` esistente avanza le stanze attive a 60 tick/s. Un registro in memoria contiene lo stato runtime delle partite attive; con persistenza, non diventerà la fonte autorevole dei salvataggi. Controller, gateway, persistenza e presentazione restano in moduli distinti.

Il client di gioco resta sullo stack web presente. La lobby riceve l’identità già autenticata dal server e non richiede più un nickname per entrare. Le nuove viste di account, elenco/dettaglio campagne, inviti, cronologia e classifica vanno composte in schermate e componenti riusabili, mantenendo il renderer Phaser separato dalla UI accessibile in DOM.

### PostgreSQL e Prisma

PostgreSQL è la fonte durevole per account, appartenenze, campagne e risultati. Prisma gestisce schema, accesso dati e transazioni; le modifiche strutturali passano da migrazioni versionate, applicate prima di avviare il servizio. `docker-compose.yml` fornisce PostgreSQL 17 e Mailpit per lo sviluppo locale, con porte limitate a loopback e volume persistente per il database. Mailpit raccoglie i link email e li rende leggibili nella UI locale. `.env.example` documenta le variabili; `.env` è locale e ignorato da Git. La configurazione usa variabili d’ambiente, senza credenziali locali nel repository.

La colonna JSONB del salvataggio ospita il documento `CampaignSave` prodotto da `makeSave`. I campi usati per autorizzazioni, filtri, aggregazioni e ordinamento della classifica rimangono colonne o relazioni normalizzate: la classifica non deve scansionare né interpretare il JSON del motore.

Modelli logici proposti:

| Modello | Dati principali e vincoli |
| --- | --- |
| `Account` | UUID, email normalizzata univoca, password hash scrypt nullable per gli account preesistenti, data di verifica, nickname e chiave nickname normalizzata univoca, date di creazione/aggiornamento. L’email non è esposta nelle API pubbliche. |
| `EmailChallenge` | Hash del token, scopo (`REGISTER`, `LOGIN` legacy o `PASSWORD_RESET`), account o dati di registrazione in attesa e hash della password pendente, scadenza e data di consumo. Token monouso; il database non conserva token o password in chiaro. |
| `AuthSession` | Hash del token cookie, account, scadenza e revoca. Più dispositivi possono avere sessioni indipendenti. |
| `Campaign` | UUID, proprietario, nome, modalità (`SOLO`/`COOP`), `saveState` JSONB, versione del formato salvataggio, versione dei contenuti di gioco, revisione monotona e date. |
| `CampaignMember` | Relazione univoca campagna/account, ruolo (`OWNER`/`MEMBER`) e data di ingresso. |
| `CampaignInvite` | Hash del token casuale, campagna, autore, scadenza, revoca, usi e limite d’uso. Il token in chiaro compare solo nel link consegnato al creatore. |
| `GameSession` | UUID, campagna, modalità, stato (`ACTIVE`, `COMPLETED`, `INTERRUPTED`, `ABANDONED`), motivo di chiusura, avvio, ultimo salvataggio durevole e chiusura. `COMPLETED` indica uscita volontaria o finale raggiunto; `INTERRUPTED` indica arresto non ordinato; `ABANDONED` indica sessione chiusa dopo la scadenza della riconnessione. |
| `GameSessionParticipant` | Sessione/account, personaggio scelto, nickname alla partenza, punteggio iniziale, ultimo punteggio accreditato, punti guadagnati e uscite completate raggiunte. Vincolo univoco sessione/account. |
| `GameSessionCheckpoint` | Sequenza e revisione persistite con hash del salvataggio; rende idempotenti i retry dei commit. |

Vincoli aggiuntivi: foreign key con cancellazione esplicita, indici per campagne per account e classifiche per modalità/punti/progresso, un solo proprietario per campagna e una sola sessione attiva per campagna. La sessione attiva è protetta da un indice univoco parziale PostgreSQL mantenuto nelle migrazioni Prisma. Gli inviti scaduti o revocati non concedono accesso. L’accettazione di un invito e la creazione dell’appartenenza avvengono nella stessa transazione.

## 4. Registrazione, accesso e autorizzazione

1. Le pagine dedicate `/register` e `/login` raccolgono email e password; la registrazione richiede anche il nickname e la conferma password. Il server normalizza l’email, verifica il dominio esatto e controlla l’unicità del nickname.
2. Il server valida password da 12 a 128 code point e ne memorizza solo un hash scrypt con salt casuale. L’hash della nuova password resta nel payload della verifica pendente e non viene mai inviato in email.
3. La registrazione invia un link email con token casuale ad alta entropia. Il token è salvato solo come hash, scade dopo 15 minuti e si consuma una sola volta. `/verify-email` richiede un’azione esplicita con `POST`, quindi l’apertura automatica dei link da parte degli scanner email non attiva l’account.
4. Dopo la verifica, il server attiva l’account e imposta un cookie di sessione opaco `HttpOnly`, `Secure`, `SameSite=Lax`, con scadenza server-side. Il client non conserva token bearer in `localStorage`.
5. Il login verifica email e password e risponde con un messaggio generico per credenziali errate. I tentativi sono limitati per IP e email; gli account preesistenti senza hash possono impostare una password tramite recupero account.
6. `/forgot-password` invia un link monouso di reimpostazione quando l’account esiste, con risposta uguale in entrambi i casi. Il completamento richiede la nuova password, consuma il token e revoca tutte le sessioni attive dell’account.
7. Il server applica limiti di frequenza su registrazione, login, recupero e verifica; protegge le mutazioni basate su cookie da richieste cross-site e verifica l’`Origin` anche sull’upgrade WebSocket. Le pagine che consumano token impostano `Referrer-Policy: no-referrer` e non caricano risorse di terze parti.

La sola corrispondenza del dominio non dimostra il possesso dell’indirizzo: il link email verificato è necessario. La disponibilità del servizio email e del trasporto HTTPS è un prerequisito per registrazione, login e cookie di produzione.

## 5. Campagne, partite e salvataggi

### Flusso di condivisione

1. Un utente crea una campagna. Il server assegna proprietario e modalità, genera lo stato iniziale con `packages/core` e salva subito la prima revisione in PostgreSQL.
2. Il proprietario crea un invito revocabile con scadenza. Il link invita l’utente a registrarsi o accedere; l’accettazione associa l’account verificato alla campagna.
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

Prefisso HTTP proposto: `/api/v1`. Tutti gli endpoint di account e campagna richiedono cookie valido, salvo registrazione, login e verifica.

| Endpoint | Uso |
| --- | --- |
| `POST /api/v1/auth/register` | Invia email, nickname e password; avvia la verifica email. |
| `POST /api/v1/auth/login` | Verifica email e password e crea la sessione autenticata. |
| `POST /api/v1/auth/verify-link` | Consuma il token email di verifica e crea la sessione autenticata. |
| `POST /api/v1/auth/password-reset-request` | Invia le istruzioni di recupero senza rivelare se l’account esiste. |
| `POST /api/v1/auth/password-reset` | Consuma il token di recupero, aggiorna l’hash password e revoca tutte le sessioni attive. |
| `POST /api/v1/auth/logout` | Revoca la sessione corrente. |
| `GET /api/v1/me` | Legge il profilo dell’account corrente. |
| `PATCH /api/v1/me` | Cambia il nickname con controllo di unicità. |
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
3. Aggiungere account, verifica email e sessioni autenticate; distribuire client e server insieme mantenendo il tag wire WebSocket v1.
4. Aggiungere campagne condivise, inviti, salvataggio server-side e sessioni server-authoritative.
5. Aggiungere cronologia, aggregazioni e classifica; abilitare l’importazione dei salvataggi locali.

I vecchi client WebSocket v1 non sono compatibili con i nuovi campi e con l’autenticazione obbligatoria: il rilascio va coordinato tra client e server, senza introdurre il tag v2. I vecchi dati locali non vengono cancellati dal browser durante il rilascio.

## 9. Verifica richiesta prima del rilascio

Questi scenari descrivono la verifica ancora richiesta. In questa sessione sono stati eseguiti `npm run build` (generazione Prisma, type-check NestJS e build/type-check web), `docker compose config --quiet` e l’import ESM diretto del core; non sono stati eseguiti test, playtest, avvio del container o applicazione della migrazione a PostgreSQL.

- Registrazione e autenticazione: dominio esatto accettato; sottodominio, dominio simile, password fuori dai limiti, credenziali errate, email non verificata e token di verifica/recupero scaduto o riutilizzato rifiutati.
- Sicurezza sessione: cookie non leggibile da JavaScript, logout e revoca efficaci, richieste cross-site e upgrade WebSocket senza sessione rifiutati.
- Profili: nickname normalizzato univoco, aggiornamento di nickname, email mai inclusa nelle risposte pubbliche.
- Campagne: isolamento tra proprietari, accettazione/revoca/scadenza invito, membership richiesta, limite di otto partecipanti e blocco della seconda sessione concorrente.
- Persistenza: checkpoint, uscita, fase, Game Over e finale persistono; riavvio recupera l’ultima revisione valida e marca la vecchia sessione interrotta.
- Guasti: indisponibilità DB impedisce l’avvio; errore di commit mette in pausa e non invia conferma o accredito non durevole.
- Classifica: punti individuali esatti, delta senza doppio conteggio, progressi da 0 a 96, filtri singolo/cooperativa, aggiornamenti solo da simulazione server-side.
- Migrazione: formato non valido rifiutato; salvataggio locale valido importato una sola volta; copia locale conservata fino alla conferma; nessun punteggio storico importato.
- Regressione di gioco: ingressi, riconnessione, avvio host, voto corso, personaggi, salvataggi e sessioni cooperative da 2 a 8 giocatori restano coerenti.
- Prisma/PostgreSQL: migrazione da database vuoto, vincoli univoci/foreign key, commit atomici e ripristino da backup verificati su un ambiente di prova.

## 10. Configurazione operativa ancora necessaria

1. In locale, leggere i link email in Mailpit; in produzione, configurare `SMTP_URL` con il provider autorizzato e verificare l’invio dei link.
2. Definire hosting, URL pubblico, durata delle sessioni, politica di conservazione/cancellazione e obiettivi di backup prima della messa in produzione.
3. Applicare e provare la migrazione su PostgreSQL e verificare backup/ripristino in un ambiente dedicato prima del rilascio.

## Riferimenti tecnici

- [NestJS — HTTP adapters e NodeAdapter](https://docs.nestjs.com/techniques/performance)
- [NestJS — WebSocket adapters e formato dei messaggi `WsAdapter`](https://docs.nestjs.com/websockets/adapter)
- [Prisma ORM — modellazione dati e campi JSON/JSONB](https://www.prisma.io/docs/orm/data-modeling?db=postgresql)
- [Prisma ORM — transazioni](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)
- [Prisma ORM — migrazioni](https://www.prisma.io/docs/orm/migrations/how-migrations-work)
