# Plan: Expand RACopy from 1v1 to 4-Player (FFA & 2v2)

## Overview

Support up to 4 human players in two modes:
- **Free-for-all (FFA)**: 1v1v1v1 — last team with buildings standing wins
- **Teams**: 2v2 — allies share fog of war; win when both enemy teams are eliminated

The existing host-authoritative architecture scales naturally. The host already owns
all game state and syncs it to one client. Expanding to 3 clients is the same pattern.

---

## Architecture: Host-Authoritative Star Topology

```
         ┌─────────┐
         │  HOST   │  (Team 0) — owns game state, runs AI, calls checkVic
         └────┬────┘
    ┌─────────┼──────────┐
    ▼         ▼          ▼
 Client1   Client2   Client3
 (Team 1) (Team 2)  (Team 3)
```

- Host holds `MP.conns[]` — array of up to 3 PeerJS `DataConnection` objects
- Every ~100ms host broadcasts full state to all conns (existing pattern)
- Clients send action messages to host; host validates team ownership, then
  rebroadcasts state. Clients never talk to each other.
- Each connection is tagged with a `slotIndex` (1–3) at handshake time so the
  host knows which team owns that connection.

---

## Phase 1 — Foundation: Expand Team System

**Files changed: racopy.html only**

### 1.1 Team constants

```js
// Before
const TP=0, TE=1;

// After
const TEAM_COUNT_MAX = 4;
// Team IDs 0–3; MP.myTeam is set at lobby time
```

Remove the hardcoded `TE` reference everywhere (search/replace).
Use `MP.myTeam` for "my team" and introduce `MP.enemies` (array of team IDs
that are hostile to me) + `MP.allies` (array of team IDs friendly to me,
including self). For FFA, enemies = all other teams, allies = [myTeam].
For 2v2, enemies = 2 teams, allies = 2 teams.

### 1.2 Expand array state

```js
// G initializer — grow from 2-element to 4-element
credits: [3000, 3000, 3000, 3000],
power:   [0, 0, 0, 0],
pu:      [0, 0, 0, 0],
stats:   { kills:[0,0,0,0], bldgsKilled:[0,0,0,0], creditsSpent:[0,0,0,0] }
```

Only the slots actually in use are populated. Inactive slots stay at 0 and
have no entities — they are ignored by all game logic.

### 1.3 Four team palettes

Add two new entries to `TPAL`:

```js
// Team 2 — Green
[2]: { base:'#608060', lite:'#8ab08a', ... acc:'#b8f0b8', stripe:'#285a20' ... },
// Team 3 — Yellow/Gold
[3]: { base:'#908040', lite:'#c0b060', ... acc:'#f0e090', stripe:'#806010' ... },
```

### 1.4 Four spawn points

Currently `spawnBase(TP,5,5)` and `spawnBase(TE,MAP_W-15,MAP_H-15)`.

Add 4 corner spawns:

```js
const SPAWN_CORNERS = [
  { tx: 5,          ty: 5          },  // Team 0 — top-left
  { tx: MAP_W-15,   ty: MAP_H-15   },  // Team 1 — bottom-right
  { tx: MAP_W-15,   ty: 5          },  // Team 2 — top-right
  { tx: 5,          ty: MAP_H-15   },  // Team 3 — bottom-left
];
```

`initGame()` loops over active teams and calls `spawnBase(team, corner.tx, corner.ty)`
for each.

### 1.5 Alliance system

```js
// Stored on G at game start, derived from lobby settings
G.allies = {
  // FFA example (4 teams)
  0:[0], 1:[1], 2:[2], 3:[3],
  // 2v2 example (teams 0&2 vs 1&3)
  0:[0,2], 1:[1,3], 2:[0,2], 3:[1,3],
};

function isEnemy(teamA, teamB) {
  return !G.allies[teamA]?.includes(teamB);
}
```

Replace all `e.team===TP` / `e.team===TE` checks with `isEnemy()`:
- `findEnemy()` — use `isEnemy(team, e.team)`
- `checkVic()` — see Phase 4

---

## Phase 2 — Network: Multi-Connection Host

### 2.1 MP object changes

```js
const MP = {
  mode: 'solo',
  peer: null,
  conns: [],          // was: conn (single); now array of {conn, team}
  myTeam: 0,
  connected: false,
  numPlayers: 2,      // 2–4
  gameMode: 'ffa',    // 'ffa' | '2v2'
  aiDiff: 'medium',
  ping: 0,
  lastStateAt: 0,
};
```

### 2.2 Host: accept multiple connections

```js
// mpHost() — host listens for up to (numPlayers-1) connections
peer.on('connection', conn => {
  if (MP.conns.length >= MP.numPlayers - 1) { conn.close(); return; }
  const slotTeam = MP.conns.length + 1; // teams 1, 2, 3
  MP.conns.push({ conn, team: slotTeam });
  conn.on('data', data => mpHandleAction(JSON.parse(data), slotTeam));
  conn.on('open', () => updateLobbyUI());
  conn.on('close', () => { MP.conns = MP.conns.filter(c=>c.conn!==conn); updateLobbyUI(); });
});
```

### 2.3 Broadcast helper

```js
function mpSendAll(msg) {
  const s = JSON.stringify(msg);
  MP.conns.forEach(c => { try { c.conn.send(s); } catch(_){} });
}

// Targeted send (init packet sent only to the joining client)
function mpSendTo(team, msg) {
  const c = MP.conns.find(c => c.team === team);
  if (c) c.conn.send(JSON.stringify(msg));
}
```

### 2.4 Init packet — tell each client their team

When a client connects and game is starting:
```js
mpSendTo(slotTeam, {
  t: 'init',
  myTeam: slotTeam,
  numPlayers: MP.numPlayers,
  gameMode: MP.gameMode,
  allies: G.allies,
  map: G.map,
  e: mpSerEnt(),
  cr: G.credits,
  po: G.power,
  pu2: G.pu,
});
```

Client stores `MP.myTeam = msg.myTeam`, `G.allies = msg.allies`, etc.

### 2.5 State broadcast (unchanged in structure, now sent to all)

```js
// In gameLoop, replace: MP.conn.send(...) with:
mpSendAll({ t:'state', e:mpSerEnt(), cr:G.credits, po:G.power, pu2:G.pu, ti:~~G.time, ... });
```

### 2.6 Action validation in mpHandleAction()

Add `senderTeam` param; validate that ordered units/buildings belong to
`senderTeam` before applying:

```js
function mpHandleAction(msg, senderTeam) {
  if (msg.t === 'order') {
    const ids = msg.ids.filter(id => {
      const e = G.entities.find(e=>e.id===id);
      return e && e.team === senderTeam; // reject cross-team orders
    });
    // apply orders...
  }
  // ...same for place, queue, rally, etc.
}
```

### 2.7 Client connection — no changes needed

`mpJoin()` still connects to host's peer ID. The host sends back `myTeam`
in the init message. Client sets `MP.myTeam` from init instead of hardcoding it.

---

## Phase 3 — Lobby UI

### 3.1 Splash screen changes

Replace the current simple HOST / JOIN buttons with a pre-game lobby flow:

**HOST path:**
1. Click "HOST GAME"
2. Choose **number of players** (2 / 3 / 4) and **mode** (FFA / 2v2 if 4p)
3. Lobby panel shows: Room code + player slots with team colors
   ```
   Room: RA-XYZ123
   ┌──────────────────────────────────┐
   │ Slot 1 [BLUE]   — HOST (you)    │
   │ Slot 2 [RED]    — Waiting...    │
   │ Slot 3 [GREEN]  — Connected ✓   │
   │ Slot 4 [YELLOW] — AI (Medium)   │
   └──────────────────────────────────┘
   [START GAME ▶]  (enabled when min players met or all slots filled)
   ```
4. Host can mark empty slots as AI at any difficulty
5. Host clicks START — sends `{t:'start'}` to all conns; game begins

**JOIN path:**
1. Click "JOIN GAME", enter room code
2. See "Connecting…" → then lobby panel showing same slot view (read-only)
3. Host's START triggers the game

### 3.2 Ready gate

Remove the current readyOverlay / sendReady() flow.
Replace with the lobby START button — host controls game start explicitly.
This handles variable player count cleanly.

### 3.3 Lobby state sync

Host periodically sends `{t:'lobby', slots:[{team,status,name},...]}` every second
so join-page clients see live updates.

---

## Phase 4 — In-Game Changes

### 4.1 Win condition (checkVic)

FFA: a team is eliminated when all its buildings are gone.
Last surviving team wins.

```js
function checkVic() {
  const activeTeams = [...new Set(G.entities.filter(e=>e.isBuilding&&e.hp>0).map(e=>e.team))];
  // Check if my team is eliminated
  if (!activeTeams.includes(MP.myTeam) && !G.gameOver) { showOv(false); G.gameOver=true; return; }
  // 2v2: check alliance survival
  if (G.gameMode === '2v2') {
    const myAllies = G.allies[MP.myTeam];
    const enemyAllies = [...new Set(Object.values(G.allies))].filter(a=>a!==myAllies[0]);
    // ...
  }
  // FFA: winner is the last team standing
  if (activeTeams.length === 1) {
    const winningTeam = activeTeams[0];
    showOv(winningTeam === MP.myTeam || G.allies[MP.myTeam]?.includes(winningTeam));
  }
}
```

Host sends `{t:'gameover', winTeams:[0,2]}` to all clients.

### 4.2 Fog of war shared between allies (2v2)

Currently fog is indexed by team. For 2v2, reveal fog for allies:

```js
function updateFog(team) {
  // After computing visibility for `team`, also apply to allied teams
  const allies = G.allies[team] || [team];
  // Merge fog arrays across allies before rendering
}
```

In `drawFog()`, the visible area = union of all allied teams' fog maps.

### 4.3 Camera start position

```js
// In startGame(), scroll camera to myTeam's spawn corner
const corner = SPAWN_CORNERS[MP.myTeam];
G.camera.x = corner.tx * TILE - canvas.width/2;
G.camera.y = corner.ty * TILE - canvas.height/2;
```

### 4.4 Build panel — no changes needed

`setupBuildPanel()` already filters by `MP.myTeam`. Works for any team index.

### 4.5 Score/stats screen

Expand `showOv()` to show a row per active team:
- Team color swatch, kills, buildings destroyed, credits spent
- "ALLY" / "ENEMY" / "YOU" label per row

### 4.6 AI for empty slots

Host runs `runAI()` for every team configured as AI.
Generalize `runAI(teamId)` to take a team argument instead of always using `TE`.
`AI_CFG` and difficulty already exist — each AI slot can have its own difficulty.

```js
// In gameLoop on host:
G.aiSlots.forEach(({team, diff}) => runAI(team, diff));
```

---

## Phase 5 — Robustness

### 5.1 Player disconnect mid-game

If a client disconnects, options:
- **Drop**: mark their team eliminated (all buildings destroyed), continue game
- **AI takeover**: convert their team to AI control (preferred for 2v2)

Host detects disconnect via `conn.on('close')`, sets team to AI with current difficulty.

### 5.2 Desync remains unchanged

Current desync warning (`⚠ Possible desync`) still works — the host is always
authoritative. With 3 clients, host state overrides all.

### 5.3 Ping display

Show ping per connected player in the top-right HUD (host sees pings to/from
each client; clients see their ping to host).

---

## Implementation Order

| Step | Change | Complexity |
|------|--------|------------|
| 1 | Expand credits/power/stats arrays to 4 | Easy |
| 2 | Add 2 new TPAL entries | Easy |
| 3 | Add 4 spawn corners, update initGame | Easy |
| 4 | Add isEnemy() / G.allies, replace TP/TE checks | Medium |
| 5 | Generalize runAI(team) | Medium |
| 6 | MP.conns[], mpSendAll(), mpSendTo() | Medium |
| 7 | Host accept N-1 connections, slot assignment | Medium |
| 8 | Init packet with myTeam, allies | Medium |
| 9 | Update checkVic() for N teams | Medium |
| 10 | Lobby UI (player count, mode, slots, AI config) | Hard |
| 11 | Fog sharing for 2v2 allies | Medium |
| 12 | Score screen, camera start, disconnect handling | Medium |

Total estimated scope: ~500–700 lines changed/added across racopy.html.

---

## What Doesn't Change

- PeerJS transport layer — star topology already works for this
- State serialization format (mpSerEnt/mpApplyState) — just more entities
- A* pathfinding, combat, building queue — team-agnostic already
- Sound, particles, projectiles — no team coupling
- Mobile/desktop responsive layout — unaffected
