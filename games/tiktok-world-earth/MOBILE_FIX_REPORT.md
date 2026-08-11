# TikTok World Earth V10.3 - Mobile Fix build 7

## Problema riprodotto

La pagina iniziale appariva sul telefono, ma il motore entrava in `STARTUP ERROR` prima di registrare il pulsante `ENTER THE WORLD`.

Errore runtime riprodotto:

`Failed to fetch dynamically imported module: /assets/WebGLRenderer-CIqSASpL.js`

## Causa

Il bundle principale era stato rinominato in `index-V104FantasyRTS.js`, mentre dieci chunk PixiJS continuavano a importare il vecchio file inesistente `index-WdxT5ooK.js`.

## Correzioni

- Aggiornati tutti i riferimenti dei chunk al bundle realmente distribuito.
- Versionata l'intera catena degli import con `build=7` per evitare chunk vecchi nella cache mobile.
- Disabilitata la cache HTTP per HTML, JavaScript, CSS e manifest.
- Reso più rapido il rilevamento dell'IP Wi-Fi nel server Windows.
- Conservati gli asset, la mappa e gli NPC importati della build fornita.

## Avvio da telefono

1. Estrai lo ZIP sul PC.
2. Avvia `AVVIA GIOCO.bat` e lascia aperta la finestra nera.
3. Collega PC e telefono allo stesso Wi-Fi.
4. Apri sul telefono l'indirizzo mostrato dalla finestra del PC.
5. Non aprire `index.html` direttamente dal file manager del telefono: i moduli e il bridge richiedono il server incluso.

## Verifiche

- Riproduzione a viewport telefono 390 x 844: confermato `STARTUP ERROR` nella build precedente.
- Scansione post-fix: zero riferimenti a `./index-WdxT5ooK.js`.
- Controllo sintattico del bundle principale con `node --check`: superato.
- Il controllo browser finale è rimasto limitato dalla connessione del browser locale; il test conclusivo sul telefono reale resta da eseguire con `AVVIA GIOCO.bat` sul PC.
