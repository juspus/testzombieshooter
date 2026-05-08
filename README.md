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
Pointer-lock FPS camera. Click the canvas to lock the mouse cursor — from that point mouse movement rotates the view. Pitch is clamped to ±60° so you can't flip upside down. Press ESC to release the lock.

### WASD Movement
Move in the direction you're facing using WASD or arrow keys. Diagonal movement is normalized so you don't move faster at 45°. Player is clamped to the arena boundary and cannot walk through walls.

### Click-to-Shoot (Raycasting)
Left click fires a ray from the center of the screen through the scene. Hits are tested against all live zombie meshes. The closest intersected zombie is killed. No ammo limit — click as fast as you can.

### Crosshair
A simple two-line crosshair is rendered as an HTML overlay in the exact center of the viewport so it's always pixel-perfect regardless of resolution.

---

### Wave System
Each round is one wave. A wave ends when either:
- All zombies are killed → **Wave Cleared**
- The 30-second timer hits zero → **Game Over**

Wave number, kill count, and time remaining are always visible in the HUD.

#### Difficulty Scaling
| Wave | Zombies | Zombie speed |
|---|---|---|
| 1 | 5 | 1.50 u/s |
| 2 | 8 | 1.65 u/s |
| 3 | 11 | 1.80 u/s |
| N | 5 + (N−1)×3 | 1.50 + (N−1)×0.15 u/s |

Zombies spawn at random positions around the arena perimeter at the start of each wave.

---

### Zombie AI
Each zombie walks in a straight line toward the player every frame. It rotates to face the player as it moves. Zombies are simple blocky humanoids with:
- Green body, head, arms, legs
- Red glowing eyes (emissive material)
- A red point light underneath for a subtle glow on the floor

### Zombie Contact Death
If any zombie closes within **1.2 units** of the player, the player dies instantly. The game freezes and the YOU DIED screen appears.

---

### YOU DIED Screen (Souls-style)
Triggered when a zombie reaches the player.

- The screen darkens with a black vignette fade
- **YOU DIED** fades in over 1.5 seconds in deep crimson with a blood-red glow
- Wave reached and total kill count are displayed beneath
- A **Start New Game** button fades in 400 ms after the text settles
- Hovering the button lights the border red

---

### HUD (Heads-Up Display)
Rendered as an HTML overlay on top of the 3D canvas.

| Element | Detail |
|---|---|
| Wave counter | Current wave number, top-left of bar |
| Timer | Seconds remaining; turns red when ≤ 10s |
| Kill counter | `kills / total` for the current wave |
| Progress bar | Green bar at the bottom filling as zombies die |
| Hint text | Control reminder, fades into background |

---

### Screen Flow

```
Start Screen
    │
    ▼ Start Game
Playing  ──── zombie touches player ──▶  YOU DIED ──▶ Start Screen
    │
    ├── timer hits 0 ──▶ Game Over ──▶ Start Screen
    │
    └── all zombies dead ──▶ Wave Cleared ──▶ Playing (next wave)
```

#### Start Screen
Title, brief instructions, and a **START GAME** button.

#### Wave Cleared Screen
Shows the wave number just beaten, kills this wave, and how many zombies the next wave will have. **NEXT WAVE →** button continues.

#### Game Over Screen
Shown when time runs out. Displays wave reached, total kills, and how many zombies were left. **PLAY AGAIN** restarts from wave 1.

---

### Arena
- 40×40 unit floor with a dark grid
- Four walls (height 4) enclosing the space
- Four decorative pillars at the corners
- Atmospheric fog (`near: 10`, `far: 40`) so distant walls fade to black
- Lighting: warm orange point light overhead + two cool blue fill lights

---

## Tech Stack

| Package | Role |
|---|---|
| React 18 | UI framework |
| React Three Fiber 8 | React renderer for Three.js |
| @react-three/drei 9 | Three.js helpers |
| Three.js 0.167 | 3D engine |
| Zustand 4 | Global game state |
| Vite 5 | Build tool / dev server |

---

## Project Structure

```
src/
├── main.jsx                 # React root
├── App.jsx                  # Top-level component
├── store.js                 # Zustand store — all game state + actions
└── components/
    ├── Game.jsx             # Canvas setup + scene root
    ├── Arena.jsx            # Floor, walls, pillars, lighting, fog
    ├── Player.jsx           # Camera, pointer-lock, WASD, raycasting shoot
    ├── Zombie.jsx           # Single zombie mesh + movement + contact detection
    ├── ZombieManager.jsx    # Renders all live zombies, drives the game timer
    ├── HUD.jsx              # In-game overlay (wave, timer, kills, progress bar)
    └── Screens.jsx          # Start / Wave Cleared / Game Over / YOU DIED
```

---

## Running Locally

```bash
npm install
npm run dev
```

## Deploying to Vercel

Connect the repository to Vercel. It reads `vercel.json` automatically:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

No environment variables required. No authentication.
