# RACopy — Red Alert 2 Browser Edition

## Project structure
- **Single file**: `racopy.html` (~3400 lines) — all HTML, CSS, and JS in one file
- No build system, no dependencies except PeerJS CDN
- Open directly in browser to play

## Key architecture

### Game state (`G`)
All mutable game state lives in `G`, reset by `initGame()` each game:
- `G.entities[]` — all units and buildings (mixed array, differentiated by `e.isBuilding`)
- `G.credits[4]`, `G.power[4]`, `G.pu[4]` — per-team resources (4 slots, indexed by team 0–3)
- `G.fog` — `Uint8Array[MAP_H][MAP_W]`: 0=unseen, 1=explored, 2=visible
- `G.allies` — `{team: [allied teams]}`, built by `buildAllies()`
- `G.aiSlots[]` — `{team, diff, timer}` for each AI-controlled team
- `G.radarReveals[]` — active spy reveals `{cx, cy, r, until}`
- `G.radarCooldown[4]` — per-team radar spy cooldown (seconds)

### Teams
- `TP=0` (Blue), `TE=1` (Red), `2` (Green), `3` (Yellow)
- `SPAWN_CORNERS[4]` — TL, BR, TR, BL spawn positions
- `TPAL[team]` — drawing palette per team (add new teams here)
- `BC[team]` — simple fill/border colors per team

### Multiplayer (`MP`)
- `MP.mode` — `'solo'` | `'host'` | `'client'`
- `MP.myTeam` — local player's team index
- `MP.conns[]` — host's array of PeerJS connections (index = team-1)
- `MP.conn` — client's single connection to host
- Host is authoritative: runs all physics, AI, and game logic
- State synced ~4x/sec via `mpSendState()` → `mpApplyState()`
- Client sends action messages; host applies them in `mpHandleAction(msg, senderTeam)`

### AI
- `runAI(aiTeam)` — runs one AI tick for the given team
- `G.aiSlots` drives which teams are AI-controlled and at what difficulty
- `AI_CFG` — difficulty configs: `easy`, `medium`, `hard`, `amazing`
- `aiBld(type, cony, aiTeam)`, `aiBldNear(type, cony, bs, aiTeam)`, `aiQ(b, type, aiTeam)` — AI helpers

### Rendering
- `render()` — main canvas draw (terrain cache + entities + fog + particles)
- `renderMM()` — minimap (respects fog: never-seen enemies hidden, explored dimmed)
- `updateFog()` — decays 2→1 each frame, re-marks visible tiles + active radar reveals
- `TPAL[team]` palette used in all `drawBuilding_*` and `drawUnit_*` functions

### Input
- `tapAction(x, y)` — tap/left-click handler (select, place building, spy reveal, etc.)
- `issueOrder(wx, wy)` — move/attack/rally orders (right-click, double-tap)
- `touchMode` — `'select'` | `'move'` | `'attack'` | `'attackmove'` | `'radarSpy'`

## Constants (top of script)
```
TILE=32, MAP_W=80, MAP_H=60
RADAR_COOLDOWN=120s, RADAR_DURATION=900s, RADAR_RADIUS=10 tiles
```

## Common patterns

### Adding a new building type
1. Add entry to `BD` object with `{name, icon, cost, hp, power, pu, w, h, range, dmg, fr, bt}`
2. Add a `drawBuilding_TypeName(x,y,w,h,tp)` function using `TPAL[tp]`
3. Add `case 'TypeName': drawBuilding_TypeName(...); break;` in `drawBldg()`
4. Add to `getBuildables('ConYard')` if it should be buildable

### Adding a new unit type
1. Add entry to `UD` object with `{name, icon, cost, hp, spd, rng, dmg, fr, arm, cat}`
2. Add a `drawUnit_TypeName(u,p)` function
3. Add `case 'TypeName': drawUnit_TypeName(u,p); break;` in `drawUnit()`

### Adding a new multiplayer message type
1. Client sends: `MP.conn.send(JSON.stringify({t:'myMsg', ...data}))`
2. Host handles: add `else if(msg.t==='myMsg'){...}` in `mpHandleAction(msg, senderTeam)`
3. If state needs syncing: add field to `mpSendState()` and read it in `mpApplyState()`

### Checking fog visibility
```js
const fv = G.fog[ty]?.[tx] ?? 0; // 0=unseen, 1=explored, 2=visible
```

## Token efficiency
See [`TOKEN_EFFICIENCY.md`](TOKEN_EFFICIENCY.md) for full guidelines. Key rules:
- Read only the relevant section before editing — not the whole file
- Only change what was asked; no refactoring, cosmetic fixes, or speculative additions
- No comments or docstrings on unchanged code
- Skip preamble in responses; lead with the change
- Use `/compact Focus on code changes and errors` when context gets large
- Give specific line ranges or function names in prompts to avoid broad scanning

## Workflow
- **Commit & push immediately** after each feature — no confirmation needed
- Test by opening `racopy.html` directly in browser
- Use browser DevTools console for debugging
- Syntax check: `node --input-type=module -e "new Function(require('fs').readFileSync('racopy.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])"`

## Recent features
- 4-player multiplayer (FFA + 2v2), lobby with AI slots
- AI difficulty: Easy / Medium / Hard / Amazing
- Radar spy ability (2 min cooldown, 15 min reveal, 10-tile radius)
- Minimap respects fog of war
- Zoom in/out buttons; pinch-to-zoom on mobile
- Building/unit queue with progress bars
- Power system affects build speed
