# Shooting Game — GoldenEye Improvement Plan

## Overview

All changes are to `shooting/shooting.html` (single file, no build system).
Implement in phases — each phase is playable and shippable on its own.

---

## Phase 1 — Core Feel (Highest Impact)

### 1.1 Vertical Look
**What**: Mouse Y movement pitches the camera up/down. Affects where enemies appear on screen and enables aiming high/low.

**Implementation**:
- Add `player.pitch` (clamped to ~±0.4 rad)
- In `mousemove` handler: `player.pitch -= e.movementY * 0.0025`
- In `render3D`: shift `horizonY` by `player.pitch * CH` — all wall, floor, ceiling calculations already use `horizonY` so they update automatically
- In `drawEnemies` / `drawPickups`: apply same pitch offset to `floorY` calculation

**Files touched**: `render3D`, `drawEnemies`, `drawPickups`, `mousemove` handler

---

### 1.2 Enemy Alert Propagation
**What**: When one guard spots the player, nearby guards also go alert. Creates tension and flanking.

**Implementation**:
- After any enemy transitions to `'alert'`, iterate all other enemies within `ALERT_RADIUS` (e.g. 800px)
- Set their state to `'alert'` too if they have LOS to the alerted enemy (or just by proximity)
- Add `alertSource: {x, y}` so they move toward last known player position, not their own position
- Optionally: add a brief `'react'` state (0.5s pause + "!" indicator) before they start moving

**Files touched**: `updateEnemies`

---

### 1.3 Mission Objectives System
**What**: Replace "kill all enemies" with a list of objectives. Win when all are complete.

**Implementation**:
- Add `OBJECTIVES` array: `[{ id, desc, type, done }]`
  - Types: `'kill_all'`, `'activate'` (walk up to a terminal), `'collect'` (pick up item), `'reach'` (get to exit)
- Add `OBJ_TARGETS` array: world positions for terminals/exits, rendered as sprites (like pickups)
- Render a small objective list overlay (top-left, semi-transparent) with ✓/✗
- `checkWinLose` checks `OBJECTIVES.every(o => o.done)` instead of enemy count
- Terminal activation: walk within range + press `E`

**Files touched**: `checkWinLose`, game loop, new `drawObjectives`, new `updateObjectives`

---

### 1.4 Enemy Hit Reactions
**What**: Shot enemies stagger, grab the wound, stagger-step back — before dying or continuing. Makes combat feel impactful.

**Implementation**:
- Add `'hit'` state with `hitTimer` (8–12 frames)
- On taking damage: set `e.state = 'hit'`, `e.hitTimer = 10`, `e.hitDir = angle from bullet`
- In `drawHumanFigure`: when `state === 'hit'`, offset torso/head slightly, raise one arm to wound location
- After `hitTimer` expires: transition back to `'alert'` or `'dead'`
- Death: add `'dying'` state (falls forward — squash sprite height over 20 frames) then `active = false`

**Files touched**: `shoot`, `updateEnemies`, `drawHumanFigure`

---

## Phase 2 — Mechanics

### 2.1 Ducking / Crouch
**What**: Hold `C` or `Ctrl` to crouch. Lowers camera height, reduces player hitbox, improves accuracy.

**Implementation**:
- Add `player.crouching` bool, `player.heightOffset` (lerps between 0 and -0.4)
- Shift `horizonY` by `player.heightOffset * CH`
- Reduce `SPEED` by 40% while crouching
- Enemies aimed at standing height miss more often when player is crouched (add crouch dodge chance to `updateEnemies` shoot check)
- Reduce spread on all guns while crouching

**Files touched**: `updatePlayer`, `render3D`, key handlers

---

### 2.2 Aim Down Sights (ADS)
**What**: Right-click zooms in. Sniper gets scope overlay. Other guns narrow FOV slightly.

**Implementation**:
- Add `player.aiming` bool, toggled on `mousedown` button 2 / `rightclick`
- When aiming: lerp `FOV` from `PI/2.5` to `PI/4` (or `PI/8` for sniper)
- For sniper: draw full-screen scope overlay (black vignette + crosshair reticle) when `currentGun === 'sniper' && aiming`
- Reduce gun spread by 50% while aiming
- Weapon sprite scales/shifts upward toward center when aiming

**Files touched**: `render3D`, `drawWeapon`, `drawSniper`, `shoot`, new `drawScopeOverlay`

---

### 2.3 Enemy Weapon Drops
**What**: Dead enemies drop their weapon as a pickup on the floor.

**Implementation**:
- All enemies have `e.weaponType` (assign randomly at spawn or by `e.type`)
- On `e.active = false` (death): push a new pickup into `pickups[]` at `{x: e.x, y: e.y, type: 'gun', gun: e.weaponType, active: true, timer: 0}`
- Reuse existing pickup rendering and collection logic — no extra code needed beyond the push

**Files touched**: `shoot` (death branch), `spawnEnemies`

---

### 2.4 Body Remains
**What**: Dead enemies leave a corpse sprite on the floor instead of vanishing.

**Implementation**:
- Add `corpses[]` array
- On death: push `{x: e.x, y: e.y, type: e.type}` to `corpses`
- `drawCorpses()`: render as a short, flat (squashed height ~15% normal) human figure sprite, same z-buffer clip logic as enemies
- Call `drawCorpses()` in the main loop before `drawEnemies()`
- Corpses are never removed (or fade after 5 minutes)

**Files touched**: `shoot`, new `drawCorpses`, main `loop`

---

### 2.5 Grenade
**What**: Press `G` to throw a grenade. 3-second fuse, bounces off walls, area damage.

**Implementation**:
- Add `grenades[]` array: `{x, y, vx, vy, fuse, bounces}`
- On `G` keydown: push grenade with velocity in `player.angle` direction + slight arc (vy negative initially)
- Each frame: move by velocity, check wall collisions (reflect velocity), decrement fuse
- On fuse=0: damage all enemies within `GRENADE_RADIUS` (e.g. 200px), fall off with distance; add screen shake (offset `horizonY` by random ±4 for 10 frames)
- `drawGrenades()`: render as a small dark oval sprite, same z-buffer clip as pickups
- Player starts with 2 grenades; grenades can be picked up as a new pickup type

**Files touched**: key handlers, main `loop`, new `updateGrenades`, new `drawGrenades`

---

## Phase 3 — World & Level Design

### 3.1 Door System
**What**: Sliding doors that open when approached or activated with `E`. Essential for level structure.

**Implementation**:
- Add tile type `3` = closed door, `4` = open door (passable)
- `DOORS[]` array: `{tx, ty, open, timer}` — tracks open/close state
- Each frame: doors within 80px of player auto-open (or require `E` press for locked doors); start `timer`; after 3s with no player nearby, close again
- Raycaster: tile 3 draws as a distinct door color/texture; tile 4 is open (not solid)
- `mapSolid` returns false for tile 4
- Animate: lerp door "offset" from 0→1 over 20 frames, shift the wall draw position sideways to simulate sliding

**Files touched**: `mapSolid`, `render3D`, new `updateDoors`, map data

---

### 3.2 Multiple Maps / Levels
**What**: 3–4 distinct maps selectable from the lobby. Each has its own layout, objective set, and enemy count.

**Maps planned**:
1. **Library** (current) — interior, bookshelves, many guards
2. **Dam** — outdoor-ish corridors, long sightlines, fewer but tougher guards
3. **Facility** — lab/office, tight corridors, scientists (non-combatant), ventilation routes
4. **Bunker** — underground, low ceilings, lots of doors, alarm system

**Implementation**:
- Extract map data + objectives + enemy spawns into `LEVELS[]` array
- Lobby shows level select buttons
- `startGame(levelIndex)` loads the chosen level
- Each level entry: `{name, map[][], spawns[], objectives[], pickupPositions[], playerStart}`

**Files touched**: lobby HTML, `startGame`, `resetGame`, all constant definitions

---

### 3.3 Variable Wall Heights / Ceiling
**What**: Some rooms feel taller, corridors feel narrower. Purely visual — no engine change needed.

**Implementation**:
- Add tile type `5` = tall wall (renders at 2× height scale)
- In raycaster column loop: check `MAP[my][mx]` — if `=== 5`, multiply `wallHeight` by `1.8`
- Use tall walls on outer perimeter and key rooms, short walls for alcoves

**Files touched**: `render3D`, map data

---

### 3.4 Wall Texture Patterns
**What**: Replace flat colored wall panels with tiled procedural patterns (stone blocks, metal panels, carpet).

**Implementation**:
- Use `wTexX[col]` (already computed, 0–1 within tile) + computed `wTexY` to look up a pattern
- Stone: checkerboard of `sin(texX*8)*sin(texY*8)` drives brightness variation + grout lines
- Metal: horizontal scan-line stripes + rivets at tile corners
- Bookshelf: alternating book-spine colors using `floor(texX * 6)` as book index
- No external assets needed — all procedural math

**Files touched**: `render3D` pixel fill loop

---

## Phase 4 — Audio

### 4.1 Web Audio API — Gunshots & Footsteps
**What**: Synthesized sound effects using `AudioContext`. No audio files needed.

**Sounds to implement**:
- **Gunshot** (per weapon): noise burst + low-freq thump, different character per gun
  - PP7: short sharp crack
  - KF7: longer burst with echo
  - Shotgun: wide low boom
  - Sniper: high-velocity crack + tail
- **Footsteps**: periodic low click tied to `player.bobPhase` zero-crossings
- **Hit grunt**: short noise burst when player takes damage
- **Enemy alert**: rising tone when enemy spots player
- **Pickup**: short ascending arpeggio
- **Objective complete**: short GoldenEye-style fanfare (3 notes)

**Implementation**:
- `const audioCtx = new AudioContext()` on first user gesture
- `playShot(gunType)`: create `OscillatorNode` + `GainNode`, shape with `gainNode.gain.setValueAtTime` envelope, add `BiquadFilterNode` for tone shaping
- Wrap in `try/catch` — degrade silently if audio blocked

**Files touched**: new `audio.js`-style section in script, `shoot`, `updatePlayer`, `updatePickups`

---

## Phase 5 — Polish & Atmosphere

### 5.1 Mission Briefing Screen
**What**: Between lobby and gameplay, show a GoldenEye-style briefing: mission name, objectives list, weapon loadout, animated text reveal.

**Implementation**:
- New `#briefing` div overlaid on canvas, shown after lobby, before `resetGame()`
- Text types in character-by-character using `setInterval` (GoldenEye teletype style)
- "M:" flavor text + objective list + "ACCEPT MISSION" button
- CSS: dark green background, monospace font, scanline overlay via CSS `repeating-linear-gradient`

**Files touched**: HTML structure, CSS, `startGame`

---

### 5.2 Objective HUD Overlay
**What**: Top-left corner shows current objectives with live ✓/✗ status during gameplay.

**Implementation**:
- Render in `drawHUD()` directly on canvas (not DOM) — `ctx.fillText` with semi-transparent background rect
- Green checkmark for complete, dim text for incomplete
- Flash briefly when an objective completes (3s highlight)

**Files touched**: new `drawObjectiveHUD`, main `loop`

---

### 5.3 Cheat Codes
**What**: Classic GoldenEye-style cheats entered on the pause/lobby screen. Typed key sequences.

**Cheats**:
| Code | Effect |
|---|---|
| `PAINTBALL` | Bullets leave paint splats on walls (colored circles at hit point) |
| `LICENCE` | One-shot all enemies (License to Kill mode) |
| `INVINCIBLE` | Player takes no damage |
| `TURBO` | 3× movement speed |
| `ALLGUNS` | Start with all weapons fully loaded |

**Implementation**:
- Track last N keypresses in `cheatBuffer[]`
- On each keypress, check if `cheatBuffer.join('')` ends with any cheat string
- Apply effect flags to game state: `G.cheats.paintball`, etc.
- Show "CHEAT ACTIVATED: X" flash on screen

**Files touched**: key handler, new `checkCheats`, render loop for paintball splats

---

### 5.4 Screen Shake
**What**: Camera jolts on grenade explosions, nearby enemy shots, and heavy impacts.

**Implementation**:
- Add `shakeTimer`, `shakeIntensity`
- Each frame: add `(Math.random()-0.5)*shakeIntensity` to `horizonY` offset; decay intensity
- Trigger: `startShake(intensity, duration)` from grenade, nearby shot, door slam

**Files touched**: `render3D`, new `startShake`

---

### 5.5 Pause Menu
**What**: `Escape` pauses the game, shows a simple overlay with Resume / Restart / Quit to Lobby.

**Implementation**:
- `gameRunning = false` on Escape; show `#pauseMenu` overlay
- Resume: `gameRunning = true`, restart loop
- Pointer lock is released on pause; re-acquired on resume click

**Files touched**: key handler, HTML, `loop`

---

## Implementation Order

```
Phase 1 → Phase 2.1 → Phase 2.2 → Phase 3.1 → Phase 3.2
                                  ↓
                             Phase 2.3–2.5
                                  ↓
                        Phase 4 → Phase 5
```

Recommended single-session order:
1. Vertical look (1.1)
2. Alert propagation (1.2)
3. Hit reactions + body remains (1.4, 2.4)
4. Crouch + ADS (2.1, 2.2)
5. Mission objectives (1.3)
6. Doors (3.1)
7. Enemy drops + grenade (2.3, 2.5)
8. Wall textures (3.4)
9. Audio (4.1)
10. Multiple maps (3.2)
11. Briefing screen + cheat codes + polish (5.x)
