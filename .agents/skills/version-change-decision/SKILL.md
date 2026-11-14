---
name: version-change-decision
description: "Valuta se una modifica a un flusso, processo o relativo contratto versionato richiede una nuova generazione; mantiene quella corrente finché l'utente non autorizza esplicitamente il salto. Non si applica alle normali versioni di release o dipendenze."
---

# Decisione su una nuova versione

Usa questa skill quando un task può introdurre una generazione distinta di un flusso, processo o relativo contratto (per esempio, passare da v1 a v2). Non usarla per normali versioni di release, patch o dipendenze.

## Valutazione

1. Individua la versione corrente e verifica nei documenti e negli artefatti autorevoli se il flusso è ancora in sviluppo, è stato stabilizzato, è già usato da consumatori o ha impegni di compatibilità. Non dedurre la versione attiva dal solo numero nei nomi o nei file: separa le fonti correnti da quelle storiche o superate.
2. Valuta se la richiesta può essere realizzata nella versione corrente rispettandone il contratto e gli impegni esistenti. Considera una nuova generazione solo se c'è una ragione concreta, come una modifica incompatibile, la coesistenza necessaria di comportamenti distinti o una regola di versioning già documentata. Un'estensione funzionale o una riorganizzazione, da sole, non richiedono un salto; durante lo sviluppo la versione corrente resta la scelta predefinita.
3. Se la modifica è compatibile e non c'è una necessità concreta di separare generazioni, prosegui nella versione corrente senza chiedere all'utente di scegliere un numero di versione.
4. Se una nuova generazione sembra utile, prima di crearla riassumi la versione corrente, la ragione concreta, le conseguenze sulla compatibilità e le alternative; raccomanda un'opzione e chiedi all'utente se autorizza il salto. Non creare, rinominare o migrare artefatti alla nuova versione prima di questa autorizzazione.
5. Se l'utente non autorizza il salto, prosegui nella versione corrente quando il cambiamento è valido lì. Se non lo è, sospendi solo la parte dipendente dalla nuova versione, esplicitando il blocco; continua eventuali parti indipendenti.
6. Una richiesta esplicita dell'utente di creare o adottare una versione specifica autorizza quel salto: non chiedere una seconda conferma per la stessa decisione. Verifica comunque fattibilità e coerenza con i vincoli applicabili.

Se la versione corrente o i relativi impegni non sono determinabili dalle fonti disponibili, chiarisci questo punto prima di scegliere una generazione. Non inventare una policy semver, una migrazione, una modalità di coesistenza o una conversione automatica.
