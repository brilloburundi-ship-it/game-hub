# Kingdom War 3 — Survivor Siege Arena

Permanent Game Hub project at `games/kingdom-war-3/`.

Kingdom War 3 is a separate game derived from the visual language and lightweight economy of Kingdom War 2. Kingdom War 2 is not modified by this project.

## Core mode

- Two fortress slots on a smaller arena map.
- First `JOIN` becomes the current champion; the second `JOIN` becomes the challenger.
- 35-second fortification phase before each siege.
- The winner remains in the arena, activates the champion shield, repairs/rebuilds part of the fortress and waits for the next challenger.
- Additional JOINs queue as future challengers.

## Fortress and siege

- Central castle, coastal port, gate, stone towers and a full wall perimeter.
- Walls and economy buildings are constructed progressively from the kingdom economy.
- NPC-focused warfare with swordsmen, spearmen, archers, shield units and battering rams.
- Soldiers move and select targets independently; they fight enemy NPCs, breach the gate/walls and then attack the keep.
- Castle destruction ends the round.

## LIVE interactions

- Likes repair damaged structures and add food.
- Follow adds settlers, resources and military strength.
- Gifts add resources, military power and siege power.
- During war gifts also create visible reinforcements from the fortress gate.
- Medium/large gifts can rebuild destroyed structures; large gifts give a short emergency shield pulse.

## Shared art

Kingdom War 3 intentionally reuses the game-ready pixel assets from `games/kingdom-war-2/assets/` to preserve style and avoid duplicating asset weight: castle, walls, gate, towers, economy buildings and MiniFolks citizens/military sprites. The battlefield itself is smaller and uses its own survivor-arena layout and simulation.

Bridge entry point: `window.KingdomWar3.emit(event)`.
