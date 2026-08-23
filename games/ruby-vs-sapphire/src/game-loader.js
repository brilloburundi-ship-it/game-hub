(async()=>{
  try {
    const parts = ["./src/game.part1.txt", "./src/game.part2.txt", "./src/game.part3.txt", "./src/game.part4.txt", "./src/game.part5.txt", "./src/game.part6.txt", "./src/game.part7.txt", "./src/game.part8.txt"];
    const code = (await Promise.all(parts.map(async p => {
      const r = await fetch(p, {cache:"no-store"});
      if(!r.ok) throw new Error(`Failed to load ${p}: ${r.status}`);
      return await r.text();
    }))).join("");
    (0, eval)(code + "\n//# sourceURL=ruby-vs-sapphire-game.js");
  } catch (err) {
    console.error("Ruby vs Sapphire failed to load", err);
    document.body.insertAdjacentHTML("beforeend", `<div style="position:fixed;inset:0;z-index:99999;background:#080d12;color:white;display:grid;place-items:center;font-family:system-ui"><div><h2>Ruby vs Sapphire</h2><p>Game load error.</p><pre>${String(err)}</pre></div></div>`);
  }
})();
