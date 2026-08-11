# TikTok World — Fantasy RTS V10.4

Gioco web interattivo PixiJS/WebGL per TikTok LIVE. Ogni `JOIN` fonda una civiltà e assegna casualmente uno dei dieci colori. Edifici e cittadini sono asset pixel art importati.

## Avvio su PC e telefono

1. Esegui una sola volta `ATTIVA AVVIO AUTOMATICO.bat` (su questo PC è già stato attivato nella consegna).
2. Sul telefono apri l'indirizzo contenuto in `URL TELEFONO.txt` e usa Safari → Condividi → Aggiungi alla schermata Home.
3. Da quel momento bastano PC acceso, accesso a Windows completato e telefono sullo stesso Wi-Fi. Il bridge parte nascosto da solo.
4. Per la LIVE apri TikFinity sul PC; il gioco sul telefono continuerà a ricevere gli eventi tramite il bridge.

`AVVIA GIOCO.bat` resta disponibile per aprire il gioco sul PC. Se il bridge automatico è già attivo, non crea una seconda copia. `ABILITA BRIDGE WIFI.bat` è soltanto un ripristino una-tantum nel caso Windows Firewall blocchi il telefono.

Il bridge di questo gioco è isolato: server HTTP 4187, relay TikFinity 21347, TikFinity locale 21213. Non occupa la porta 8765 del bridge di World Dominion e non modifica i suoi collegamenti di avvio.

## Mappa fantasy RTS ricostruita

- Mappa procedurale nuova da zero, con grandi continenti, golfi, isole, coste continue, fiumi, pianure, boschi, deserti, colline morbide e neve.
- Nessuna montagna triangolare o chevron sovrapposta agli edifici.
- Foreste riconoscibili ma spaziate, con radure automatiche prima della costruzione.
- Terreno 2x in un'unica texture pixel art: 768 × 432 pixel sorgente per 82.944 celle di simulazione.
- La precedente mappa V10.3 è conservata fuori dalla release in `work/map-backups/V10.3-RTS-map-before-rebuild`.
- Il salvataggio contiene `worldShapeVersion`; i salvataggi della vecchia geometria non vengono applicati alla nuova mappa.

## Regni vivi

- Il numero di cittadini Minifolks cresce con popolazione, edifici e villaggi, con limite globale adattivo per non saturare il telefono.
- I lavoratori sono assegnati prima a fattorie, segherie, cave, fucine, mercati, porti, caserme e stalle.
- Gli NPC evitano l'ingombro reale degli edifici e condividono con essi l'ordinamento di profondità.
- Otto specie Minifolks popolano le foreste: orso, uccello, cinghiale, coniglio, due cervi, volpe e lupo.
- Le strade collegano insediamenti ed edifici produttivi alla struttura più vicina, formando una rete curva e irregolare invece di linee dritte verso il castello.

## Battaglie visibili

- Dodici personaggi militari Minifolks importati: arcieri, balestrieri, spadaccini, lancieri, alabardieri, scudieri, cavalieri, maghi e nobili.
- Le armate dei due colori avanzano, attaccano e mostrano caduti durante un conflitto territoriale.
- VFX pixel art: sangue, scintille, frecce/proiettili, fuoco, macerie e strutture danneggiate o distrutte.
- La conquista continua a usare esercito, morale, età, caserme, fucine, stalle, difese e flotta per il calcolo strategico.

## Comandi

- `JOIN`, `DEVELOP`, `EXPAND`, `ATTACK @nome`, `DEFEND`, `FLEET`, `FARM`, `TRADE`.
- Like, follow e gift alimentano economia, crescita e ricompense.
- `LIVE TEST` consente prove manuali sul PC; non genera spettatori falsi.

## Prestazioni

- Server Node multiconnessione con `Range` per la musica; fallback PowerShell se Node non è disponibile.
- Asset grafici caricati in background: la mappa compare prima, poi arrivano edifici, cittadini, fauna e armate.
- Cache persistenti degli sprite; terreno, territorio e vegetazione sono texture compatte.
- Effetti a frequenza limitata, salvataggio RLE ogni 45 secondi in un momento libero del browser.
- Su telefono: trascina con un dito e usa due dita per zoomare.

La musica completa fornita dall'utente resta in Opus stereo, dura 1:08:15 e riparte solo dopo la fine.

## Nota LIVE

Prima di una diretta pubblica prova chat, like, follow, gift e streak con TikFinity reale. Nomi e prezzi regionali dei gift possono cambiare.
