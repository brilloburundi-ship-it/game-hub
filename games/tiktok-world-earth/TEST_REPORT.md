# TikTok World V10.4 — Test Report

Data: 2026-08-11

## Verifiche superate

- JavaScript gioco e server Node: controllo sintattico superato.
- Server dedicato in ascolto su `0.0.0.0:4187`; relay TikFinity dedicato su `0.0.0.0:21347`.
- URL LAN verificato: HTTP 200 in circa 0,02 secondi.
- Richieste parziali verificate: HTTP 206 con 100 byte richiesti e 100 inviati.
- Le precedenti porte 4173 e 21214 non vengono occupate da questo progetto.
- Mappa nuova con marker `fantasy-rts-v1`; rifiuto sicuro dei salvataggi geometricamente incompatibili.
- 8 sprite sheet animali importati e 12 sprite sheet militari importati, più proiettili.
- Atlante cittadini: 10 colori × 6 ruoli × 6 frame.
- Zero chiamate runtime a `pixelPerson`, `pixelSoldier`, `pixelAnimal` o `unitAccent`.
- Asset neri, vecchi NPC viola e tre bundle JavaScript obsoleti rimossi dalla release; copia recuperabile conservata in `work/removed-v10.3-assets`.
- Bundle runtime unico: `assets/index-V104FantasyRTS.js`.

## Sistemi implementati

- Cittadini proporzionali alla crescita del regno, con tetto adattivo di 240 sprite complessivi circa.
- Percorsi cittadini senza attraversamento degli edifici.
- Fauna forestale animata con massimo 96 punti deterministici e riuso degli sprite.
- Battaglie di 7,5 secondi con due schieramenti, animazioni di marcia, attacco e morte.
- Danno alle strutture vicine al fronte, incendio e possibile distruzione.
- Sangue pixel, scintille, fuoco e macerie generati a frequenza limitata.
- Rete stradale curva basata sulla struttura/insediamento più vicino.
- Touch mobile con trascinamento a un dito e pinch-to-zoom.
- Caricamento asincrono degli asset per mostrare prima il terreno.

## Da verificare sul dispositivo reale

- Fluidità prolungata sul telefono specifico durante una LIVE.
- Apertura Safari dalla rete Wi-Fi reale del telefono.
- Payload TikFinity reale: chat, like, follow, gift e streak.
- Bilanciamento visivo delle battaglie con molti regni simultanei.

Il test nel browser integrato ha evidenziato cache persistente della vecchia sessione; per questo la release usa un nome bundle nuovo e un guard DOM anti-doppio avvio. La prova definitiva di Safari resta da eseguire sul telefono dell'utente.

## Bridge automatico

- Verificato avvio nascosto tramite `autostart.vbs` e collegamento nella cartella Esecuzione automatica di Windows.
- Verificati listener dedicati `0.0.0.0:4187` e `0.0.0.0:21347` dopo il riavvio del solo processo TikTok World.
- Verificato che World Dominion continui separatamente su `0.0.0.0:8765`.
- `AVVIA GIOCO.bat` rileva il bridge già attivo e non crea una seconda istanza.

## ENTER WORLD build 6

- Riprodotto il clic nel browser e isolato un errore pointer di Pixi durante l'uscita dalla schermata iniziale.
- La schermata viene ora chiusa prima dello sblocco audio/connessione bridge, con fallback per browser che rifiutano `AudioContext`.
- Aggiunti tap `touchend`, protezione anti-doppio avvio e `pointer-events: none` immediato sulla schermata chiusa.
- Verificato nel browser: pulsante visibile prima del clic e `#start-screen` non visibile dopo il clic.
- URL aggiornato con firma `?build=6` per evitare il riuso del vecchio bundle in una scheda già aperta.
