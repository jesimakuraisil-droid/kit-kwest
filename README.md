# Kit Kwest — by iby

A pastel, pixel-art infinite platformer starring a cat. No build step,
no dependencies — just open `index.html` in a browser.

## How to run
Double-click `index.html`, or serve the folder locally:
```
npx serve .
```
Needs an internet connection for the live trivia questions (falls back
to a local question bank + infinite procedural math questions if offline).

## Controls
- **Move**: on-screen joystick (bottom-left), or Arrow keys / A-D
- **Jump**: on-screen JUMP button (bottom-right), or Space / Up / W
- **Attack** (boss fights only): ATK button, if you have a weapon equipped
- **Pause**: the ⏸ button, top-right
- **Dev cheat**: tiny dot in the bottom-left corner of the frame

## Features
- Infinite procedurally generated terrain, 5 biomes, unpredictable portal spacing, difficulty ramps up over distance
- Trivia gates pull from a live public trivia API (thousands of random questions across every category) plus infinite procedural math questions, with a local offline fallback bank
- XP + leveling, bonus coins every 10 levels
- Boss fight every 10,000 studs — stomp the boss or shoot it with an equipped weapon
- 100-skin gacha (500 coins/spin) + inventory with equip
- 10 upgrades: Jetpack, Car, Speed Boost, Shield Bubble, Mega Jump, Double Jump Charm, Lucky Clover, Nine Lives, Time Freeze, Mini Form — each a 10s timed power-up with a visible in-game effect
- 4 weapons (permanent purchases) for ranged boss damage
- 8 cosmetic accessories worn on the cat's head
- 12 achievements tracked from persistent stats
- HUD shows live distance-to-next-boss
- Secret path far to the left leads to a hidden wizard
- Auto-save via localStorage (progress, coins, skins, accessories, weapons, stats)

## Files
- `index.html` — page structure + all styling
- `game.js` — full game logic (physics, world generation, UI wiring, trivia API)
