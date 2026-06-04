# GitHub CI Setup

Questa guida descrive come configurare GitHub in modo che:

- le PR verso `main` e `dev` eseguano la CI
- il merge sia consentito solo se la CI passa
- i push diretti su `main` e `dev` siano bloccati
- gli hotfix mergiati in `main` aprano automaticamente una PR di back-merge verso `dev`

## Workflow presenti nel repository

- `.github/workflows/ci.yml`
  - trigger su `pull_request` verso `main` e `dev`
  - trigger su `push` verso `main` e `dev`
  - check finale richiesto: `ci-success`
- `.github/workflows/hotfix-backmerge.yml`
  - quando una PR `hotfix/* -> main` viene mergiata, apre una PR `main -> dev`

## Checklist rapida

1. Verificare che i workflow siano presenti nel branch predefinito del repository.
2. Aprire `Settings -> Rules -> Rulesets` nel repository GitHub.
3. Creare un ruleset per `main`.
4. Creare un ruleset per `dev`.
5. Abilitare l'obbligo di pull request per entrambi.
6. Abilitare il blocco dei push diretti per entrambi.
7. Impostare `ci-success` come required status check per entrambi.
8. Verificare il flusso con una PR di test `feature/* -> dev`.
9. Verificare il flusso hotfix con una PR di test `hotfix/* -> main`.

## Configurazione ruleset per `main`

1. Aprire `Settings -> Rules -> Rulesets`.
2. Cliccare `New ruleset`.
3. Scegliere `New branch ruleset`.
4. Nome consigliato: `Protect main`.
5. In `Enforcement status`, selezionare `Active`.
6. In `Target branches`, aggiungere `main`.
7. Abilitare `Restrict deletions`.
8. Abilitare `Require a pull request before merging`.
9. Dentro la sezione della pull request, configurare:
   - `Require approvals`: almeno `1`
   - facoltativo: `Dismiss stale pull request approvals when new commits are pushed`
   - facoltativo: `Require review from code owners`, solo se userai un file `CODEOWNERS`
10. Abilitare `Require status checks to pass`.
11. Aggiungere come check richiesto `ci-success`.
12. Abilitare `Block force pushes`.
13. Abilitare il blocco dei direct pushes. Se GitHub mostra l'opzione come restrizione bypass/push, assicurati che solo gli admin autorizzati abbiano eccezioni.
14. Salvare il ruleset.

## Configurazione ruleset per `dev`

1. Aprire `Settings -> Rules -> Rulesets`.
2. Cliccare `New ruleset`.
3. Scegliere `New branch ruleset`.
4. Nome consigliato: `Protect dev`.
5. In `Enforcement status`, selezionare `Active`.
6. In `Target branches`, aggiungere `dev`.
7. Abilitare `Restrict deletions`.
8. Abilitare `Require a pull request before merging`.
9. Dentro la sezione della pull request, configurare:
   - `Require approvals`: almeno `1`
   - facoltativo: `Dismiss stale pull request approvals when new commits are pushed`
10. Abilitare `Require status checks to pass`.
11. Aggiungere come check richiesto `ci-success`.
12. Abilitare `Block force pushes`.
13. Abilitare il blocco dei direct pushes.
14. Salvare il ruleset.

## Perche' il check richiesto e' `ci-success`

Il workflow `ci.yml` usa un job finale chiamato `ci-success` come gate unico.

Questo evita problemi quando il job reale di verifica viene skippato per path filtering. In quel caso:

- `verify` puo' risultare `skipped`
- `ci-success` passa comunque
- la PR non resta bloccata da check mancanti o non riportati

Per questo motivo il required check da configurare su GitHub deve essere solo `ci-success`.

## Flusso operativo previsto

### Feature flow

1. Creare un branch `feature/<nome>` partendo da `dev`.
2. Aprire una PR `feature/<nome> -> dev`.
3. Attendere l'esecuzione della CI.
4. Effettuare il merge solo quando `ci-success` e' verde.

### Release flow

1. Aprire una PR `dev -> main`.
2. Attendere l'esecuzione della CI.
3. Effettuare il merge solo quando `ci-success` e' verde.

### Hotfix flow

1. Creare un branch `hotfix/<nome>` partendo da `main`.
2. Aprire una PR `hotfix/<nome> -> main`.
3. Attendere l'esecuzione della CI.
4. Effettuare il merge solo quando `ci-success` e' verde.
5. Dopo il merge, GitHub Actions crea automaticamente una PR `main -> dev`.

## Verifica consigliata dopo la configurazione

1. Provare un push diretto su `dev`.
   - risultato atteso: push rifiutato
2. Aprire una PR di test `feature/test-ci -> dev`.
   - risultato atteso: parte il workflow `CI`
   - risultato atteso: compare il check `ci-success`
3. Tentare il merge prima che i check finiscano.
   - risultato atteso: merge bloccato
4. Fare merge della PR quando `ci-success` e' verde.
   - risultato atteso: merge consentito
5. Aprire una PR di test `hotfix/test-fix -> main`.
6. Dopo il merge della PR hotfix, verificare che venga aperta una PR `main -> dev`.

## Troubleshooting

### Il check `ci-success` non compare tra i required checks

1. Assicurarsi che il workflow `CI` sia gia' stato eseguito almeno una volta sul repository.
2. Se necessario, aprire una PR di test verso `dev` per far comparire il check nella lista GitHub.

### Il push diretto non e' bloccato

1. Verificare che il ruleset sia `Active`.
2. Verificare che il branch target sia esattamente `main` o `dev`.
3. Verificare di non avere permessi di bypass attivi sul ruleset.

### La PR di back-merge non viene creata

1. Verificare che la PR mergiata avesse come branch sorgente un nome `hotfix/*`.
2. Verificare che il merge target fosse `main`.
3. Verificare nella tab `Actions` l'esecuzione del workflow `Hotfix Back-Merge`.
4. Verificare che non esista gia' una PR aperta `main -> dev`.
