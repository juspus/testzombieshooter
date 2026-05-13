# Zombie Shooter

A first-person wave-based zombie shooter built with React Three Fiber. No login required. Runs in the browser.

**Live:** deployed on Vercel (connect repo, auto-detects config)

---

## How to Play

| Input | Action |
|---|---|
| Click canvas | Lock mouse / shoot |
| WASD / Arrow keys | Move |
| Mouse | Aim |
| ESC | Release mouse |

---

## Features

### First-Person Camera
Pointer-lock FPS camera. Click the canvas to lock the mouse cursor — mouse movement rotates the view. Pitch clamped to ±60°. Press ESC to release.

### WASD Movement
Move in the direction you're facing. Diagonal movement is normalized. Player is clamped to the arena boundary and cannot walk through walls.

### Click-to-Shoot (Raycasting)
Left click fires a ray from screen center through the scene. Closest intersected zombie is killed. Headshots are one-hit kills regardless of zombie health.

### Wave System
Each round is one wave. Ends when all zombies are killed or the timer hits zero.

#### Difficulty Scaling
| Wave | Zombies | Speed |
|---|---|---|
| 1 | 5 | 1.50 u/s |
| 2 | 8 | 1.65 u/s |
| N | 5 + (N−1)×3 | 1.50 + (N−1)×0.15 u/s |

Up to 25 zombies active at once; extras queue and spawn as kills happen.

### Zombie AI
Each zombie pathfinds toward the player using A*. Zombies can switch to "attack window" mode — targeting boarded windows to break in. Animated humanoid meshes with walk cycle, arm swing, and idle sway.

### Window Barricade Shop
Between waves, spend coins to board up windows with planks. Planks slow zombie entry. Upgrade to reinforced (metal-striped) planks.

### Perk Upgrades
The supply chest also sells one-time perks: Fast Hands, Deep Pockets, Iron Sights, Runner's Breath, Carpenter, and Knife Mastery. Perks improve reload speed, ammo-pack value, near-head hit forgiveness, movement speed, boarding speed, and knife reach/cooldown.

### Zombie Contact Death
Zombie within 1.2 units of player → instant death. YOU DIED screen with Souls-style fade-in.

---

## Environment

### Cabin Interior
A detailed log cabin with:
- Multiple rooms: main room, bedroom, hall, kitchen
- Fireplace with animated emissive flames
- Furniture: chest, bookshelves, desk, bed, lanterns, rugs
- Barricaded west door
- 6 windows (boardable)
- Ceiling with exposed beams and cobwebs
- Pitched gable roof (exterior)

### Forest Skybox
A cylindrical skybox wrapping a baked 4096×1024 night-forest panorama. Dark pine silhouettes against a starry sky. Single draw call, `meshBasicMaterial` (no lighting cost).

### Lighting
Moonlight directional shadow (512×512 map) + ambient + hemisphere fill + 6 interior point lights. Fireplace glow with no shadow map (performance).

---

## Screen Flow

```
Start Screen
    │
    ▼ Start Game
Playing ──── zombie touches player ──▶ YOU DIED ──▶ Start Screen
    │
    ├── timer hits 0 ──▶ Game Over ──▶ Start Screen
    │
    └── all zombies dead ──▶ Wave Cleared ──▶ Intermission ──▶ Playing
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
├── store.js                 # All game state + actions
├── cabin.js                 # Cabin dimension constants, window/door defs
├── walls.js                 # Wall segment geometry for A* pathfinding
├── sounds.js
└── components/
    ├── Game.jsx             # Canvas + fog + scene root
    ├── Arena.jsx            # Cabin interior, lighting, Roof component
    ├── ForestSkybox.jsx     # Baked-panorama cylinder skybox
    ├── Player.jsx           # Camera, pointer-lock, WASD, raycasting
    ├── Zombie.jsx           # Zombie mesh + AI + animation
    ├── ZombieManager.jsx    # Renders live zombies + shader warmer
    ├── BulletTrails.jsx
    ├── ShellCasings.jsx
    ├── HUD.jsx              # Wave, timer, kills, progress bar
    ├── Shop.jsx             # Between-wave window barricade shop
    └── Screens.jsx          # Start / Wave Cleared / Game Over / YOU DIED
```

---

## Running Locally

```bash
npm install
npm run dev
```

## Deploying to Vercel

Connect the repository to Vercel. It reads `vercel.json` automatically. No environment variables required.
