# Istruzioni per gli agenti che lavorano su questo progetto

## Come lavorare

- **Porta a termine da solo.** Il proprietario monitora, non collabora passo passo: non fermarti a chiedere conferma per scelte tecniche, dettagli reversibili o "come preferisci". Scegli l'opzione ragionevole, dichiarala mentre procedi, e finisci il lavoro.
- **Domande solo se bloccanti.** Chiedi soltanto quando manca un'informazione che non puoi ricavare dal codice, dai test o dalla documentazione, o quando un'azione è irreversibile e non autorizzata (deploy in produzione, cancellazioni, invii verso l'esterno).
- **Chiudi tutto.** Se una richiesta elenca più problemi o lasci aperti dei limiti noti, risolvili nello stesso lavoro finché sono alla tua portata. Quello che richiede una decisione di prodotto o una chiave che non hai, dichiaralo alla fine con il motivo.
- **Committi e pusha** su `origin/main` a lavoro finito, con un messaggio che dice *perché* è stata fatta la modifica (stile dei commit già presenti: inglese, impersonale, due o tre frasi).
- **Verifica il minimo necessario** e dillo con precisione: test, `npx tsc --noEmit`, `npx eslint app lib tests`, `npm run build`. Distingui sempre ciò che hai verificato da ciò che non hai potuto verificare.
- **Rispondi in italiano**, conciso ma con le ragioni delle scelte. Il proprietario legge il messaggio finale, non i passaggi intermedi.

## Contesto tecnico

- Next.js (App Router) + Tailwind, deploy su Vercel; Supabase per catalogo e ordini; Stripe per i pagamenti; Stencil Lab in `app/bwslab`.
- **Il denaro si calcola solo sul server**, dal catalogo in `lib/shop/catalog.ts`: il browser non deve mai proporre un importo diverso da quello pubblicato.
- **La pressa costa**: ogni generazione passa da `reserveGeneration()` (tetto giornaliero con lease che scade da sola) e va confermata con `confirm()` quando l'immagine esiste.
- Il dev server su questa macchina non idrata le pagine: per verifiche di comportamento usare `npm run build` + `npx next start -p 3101`.
- Non inventare chiavi: se una funzione richiede una variabile d'ambiente che non c'è, la funzione resta spenta e lo dice, senza rompere il resto.
