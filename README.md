# Cabin

A first-person wave-based survival shooter built with React Three Fiber. No login required. Runs in the browser.

**Live:** deployed on Vercel (connect repo, auto-detects config)

---

## How to Play

| Input | Action |
|---|---|
| Click canvas | Lock mouse |
| Left click | Shoot |
| WASD / Arrow keys | Move |
| Mouse | Aim |
| Scroll wheel | Switch weapon |
| R | Reload |
| Q | Toggle gun / knife |
| E (near chest) | Open supply shop |
| Hold E (near window) | Board / upgrade window |
| Hold T | Skip intermission countdown |
| ESC | Release mouse / close shop |

---

## Weapons

Four weapons, each using a distinct caliber with its own separate ammo pool. Switch between owned weapons at any time with the scroll wheel.

| Weapon | Caliber | Magazine | Cost | Fire Mode |
|---|---|---|---|---|
| Pistol | 9mm | 10 | free | Semi-auto |
| Pump Shotgun | 12ga | 8 shells | €150 | Pump-action |
| AK-47 | 5.45mm | 30 rds | €270 | Full-auto |
| Desert Eagle | .50 AE | 7 rds | €700 | Semi-auto |

- **Shotgun** fires 12 pellets per shot in a cone spread; each pellet is independently raycasted.
- **AK-47** fires continuously at 10 rounds/s while the mouse button is held.
- **Desert Eagle** delivers an instant kill and pierces through up to 3 enemies in a line.
- Switching weapons preserves each weapon's clip and reserve separately.

---

## Features

### First-Person Camera
Pointer-lock FPS camera. Click the canvas to lock the mouse cursor — mouse movement rotates the view. Pitch clamped to ±60°. Press ESC to release.

### WASD Movement
Move in the direction you're facing. Diagonal movement is normalized. Player is clamped to the arena boundary and cannot walk through walls (A* navigation grid).

### Wave System
Waves spawn `5 + (N−1)×3` zombies. Up to 25 are active at once; extras queue and slot in as kills happen. Between waves an intermission countdown lets you board windows and buy from the shop.

#### Difficulty Scaling
| Wave | Zombies | Speed |
|---|---|---|
| 1 | 5 | 1.50 u/s |
| 2 | 8 | 1.55 u/s |
| N | 5 + (N−1)×3 | 1.50 + (N−1)×0.05 u/s |

### Zombie AI
Each zombie pathfinds toward the player using A*. Zombies can switch to "attack window" mode — targeting boarded windows to break in. Animated humanoid meshes with walk cycle, arm swing, and idle sway.

#### Zombie Archetypes
| Unlocks Wave | Type | Behavior |
|---:|---|---|
| 1 | Walker | Standard |
| 3 | Crawler | Low profile, harder to hit |
| 5 | Brute | High health, slow, hits planks hard |
| 7 | Runner | Fast, low health |
| 9 | Screamer | Buffs nearby zombies' speed |
| 10 | Boss | Massive health, unique entrance |

### Melee Knife
Press **Q** to switch to the knife. One-swing kills within ~2.2 units in a 160° forward arc. Cooldown 0.4 s (0.25 s with Knife Mastery perk). Switch back with Q.

### Ammo Crate Pickups
During a wave, glowing ammo crates spawn every 10 s at one of the four interior cabin corners. Walk into one to collect +10 rounds for your currently equipped weapon.

### Performance Bonuses
Wave-clear payouts reward skilled play on top of the base €15 + €1/kill:

| Bonus | Amount |
|---|---|
| Headshot kills | €0.50 each |
| Knife kills | €2.00 each |
| No planks lost | €10 (if planks existed at wave start) |
| Fast clear | €8 (finish under par time) |

### Window Barricading
Stand near a window and hold **E** to nail a plank (€2.50, 2 s hold). Each window takes up to 2 planks. In the shop, enable **Strong Planks** mode to board with metal-reinforced planks (€20/plank, withstands 20 hits vs. 5).

### Supply Chest Shop
Approach the chest and press **E** to open the shop during intermission.

**Weapons & Ammo**
- AK-47 — €270
- Desert Eagle — €700
- Pump Shotgun — €150
- Ammo Pack — €10 (+20 rounds to active weapon's reserve)

**One-time Perks**
| Perk | Cost | Effect |
|---|---|---|
| Fast Hands | €80 | Reload 33% faster (1.0 s vs 1.5 s) |
| Deep Pockets | €80 | Ammo packs give +30 rounds |
| Iron Sights | €75 | Near-head hits count as headshots |
| Runner's Breath | €90 | Move 15% faster |
| Carpenter | €65 | Board windows 35% faster |
| Knife Mastery | €70 | Longer reach and faster cooldown |

### Zombie Contact Death
A zombie within 1.2 units of the player triggers instant death. **YOU DIED** screen with run summary (wave, kills, weapon, perks).

---

## Environment

### Cabin Interior
A detailed log cabin with:
- Multiple rooms: main room, bedroom, hall, kitchen
- Fireplace with animated emissive flames
- Furniture: chest, bookshelves, desk, bed, lanterns, rugs
- Barricaded west door
- 6 boardable windows
- Ceiling with exposed beams and cobwebs
- Pitched gable roof (exterior)

### Forest Skybox
A cylindrical skybox wrapping a baked 4096×1024 night-forest panorama. Dark pine silhouettes against a starry sky. Single draw call, `meshBasicMaterial` (no lighting cost).

### Lighting
Moonlight directional shadow (512×512 map) + ambient + hemisphere fill + 6 interior point lights. Fireplace glow with no shadow map (performance).

---

## Multiplayer (co-op)

Two players can join the same cabin over WebSocket. One player hosts; the other joins with a room code. The host drives all game logic; the guest syncs position and receives events in real time.

---

## Screen Flow

```
Start Screen
    │
    ▼ Start Game
Intermission ──▶ Playing ──── zombie touches player ──▶ YOU DIED ──▶ Start Screen
                   │
                   └── all zombies dead ──▶ Wave Cleared ──▶ Intermission
```

---

## Tech Stack

| Package | Role |
|---|---|
| React 18 | UI framework |
| React Three Fiber 8 | React renderer for Three.js |
| @react-three/drei 9 | Three.js helpers (useTexture, etc.) |
| Three.js 0.167 | 3D engine |
| Zustand 4 | Global game state |
| Vite 5 | Build tool / dev server |

---

## Project Structure

```
public/
└── forest-panorama.png      # Baked night-forest panorama (4096×1024)
src/
├── main.jsx
├── App.jsx
├── store.js                 # All game state + actions (Zustand)
├── cabin.js                 # Cabin dimension constants, window/door defs
├── walls.js                 # Wall segment geometry for A* pathfinding
├── sounds.js                # Audio helpers
├── net.js                   # WebSocket multiplayer networking
└── components/
    ├── Game.jsx             # Canvas + fog + scene root
    ├── Arena.jsx            # Cabin interior, lighting, Roof component
    ├── ForestSkybox.jsx     # Baked-panorama cylinder skybox
    ├── Player.jsx           # Camera, pointer-lock, WASD, shooting, scroll weapon switch
    ├── Gun.jsx              # 3-D gun models (Pistol, AK-47, Desert Eagle, Shotgun)
    ├── Knife.jsx            # Melee knife model + swing animation
    ├── Zombie.jsx           # Zombie mesh + AI + animation
    ├── ZombieManager.jsx    # Renders live zombies + shader warmer
    ├── BulletTrails.jsx
    ├── ShellCasings.jsx
    ├── BulletPickups.jsx    # Ammo crates that spawn during waves
    ├── HUD.jsx              # Weapon, caliber, ammo, wave, kills, progress bar
    ├── Shop.jsx             # Between-wave supply chest shop
    ├── Screens.jsx          # Start / Wave Cleared / Intermission / YOU DIED
    ├── Walls.jsx            # Visible wall geometry
    ├── NetManager.jsx       # Multiplayer event bus
    └── RemotePlayer.jsx     # Ghost mesh for the co-op partner
```

---

## Running Locally

```bash
npm install
npm run dev
```

## Deploying to Vercel

Connect the repository to Vercel. It reads `vercel.json` automatically. No environment variables required.
