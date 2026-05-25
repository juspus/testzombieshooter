"""
Generates pixel-art cabin-in-woods-under-moonlight icons.
32×32 pixel grid, scaled to 512×512 and 192×192 PNG.
Also writes a pixel-art SVG.
"""
from PIL import Image, ImageDraw
import math, os

# ── Palette ──────────────────────────────────────────────────────────────────
BG       = (  4,  6, 14)   # deep night sky
STAR     = (220,230,255)   # tiny stars
MOON     = (240,240,200)   # pale moon disc
MOON_GL  = (255,255,230)   # moon highlight
MOONHALO = ( 60, 60, 40)   # soft halo around moon
CLOUD    = ( 28, 32, 50)   # dark cloud wisps
TREE_D   = (  8, 22, 10)   # dark pine (far)
TREE_M   = ( 12, 38, 16)   # mid pine
TREE_L   = ( 20, 55, 22)   # lit pine edge (moonlit)
TRUNK    = ( 35, 22, 12)   # trunk brown
GROUND   = ( 18, 28, 16)   # dark grass
GROUND2  = ( 24, 38, 20)   # lighter grass stripe
SNOW     = (200,210,220)   # roof snow/frost
WALL_D   = ( 60, 38, 20)   # cabin wall dark
WALL_L   = ( 90, 58, 32)   # cabin wall moonlit face
WALL_S   = ( 45, 28, 14)   # cabin wall shadow
ROOF_D   = ( 30, 18,  8)   # roof dark
ROOF_L   = ( 55, 36, 18)   # roof moonlit
CHIM     = ( 50, 32, 16)   # chimney
SMOKE    = ( 55, 55, 65)   # smoke puff
WIN_O    = (  0,  0,  0)   # window frame
WIN_G    = (200,160, 60)   # warm glow
WIN_G2   = (240,200,100)   # bright glow centre
WIN_GL   = (255,230,140)   # hottest centre
DOOR_D   = ( 35, 20,  8)   # door dark
DOOR_L   = ( 55, 36, 16)   # door lit

# ── 32×32 pixel grid (row 0 = top) ───────────────────────────────────────────
# Each cell: palette colour or None (use BG)
# Build programmatically for precision.

W, H = 32, 32
grid = [[BG]*W for _ in range(H)]

def px(row, col, color):
    if 0 <= row < H and 0 <= col < W:
        grid[row][col] = color

def hline(row, c1, c2, color):
    for c in range(c1, c2+1):
        px(row, c, color)

def vline(col, r1, r2, color):
    for r in range(r1, r2+1):
        px(r, col, color)

def rect(r1,c1,r2,c2,color):
    for r in range(r1,r2+1):
        for c in range(c1,c2+1):
            px(r,c,color)

# ── Stars ─────────────────────────────────────────────────────────────────────
star_pos = [
    (1,2),(1,8),(1,14),(1,22),(1,28),
    (2,5),(2,18),(2,25),
    (3,11),(3,29),
    (4,3),(4,19),
    (5,7),(5,26),
    (6,13),(6,30),
    (0,17),(0,24),
]
for r,c in star_pos:
    px(r,c,STAR)

# ── Moon (top-right) ─────────────────────────────────────────────────────────
# Moon centre at (4, 24), radius ~4
moon_cx, moon_cy, moon_r = 24, 4, 4
for r in range(H):
    for c in range(W):
        dist = math.sqrt((c - moon_cx)**2 + (r - moon_cy)**2)
        if dist <= moon_r - 0.5:
            col = MOON_GL if dist <= 1.5 else MOON
            px(r, c, col)
        elif dist <= moon_r + 1.5:
            # halo blend — only on dark BG pixels
            if grid[r][c] == BG:
                px(r, c, MOONHALO)

# ── Cloud wisps ───────────────────────────────────────────────────────────────
for c in range(18, 24): px(3, c, CLOUD)
for c in range(19, 26): px(4, c, CLOUD)
for c in range(28, 32): px(5, c, CLOUD)
for c in range(29, 32): px(6, c, CLOUD)

# ── Ground ────────────────────────────────────────────────────────────────────
hline(25, 0, 31, GROUND)
hline(26, 0, 31, GROUND)
hline(27, 0, 31, GROUND2)
rect(28, 0, 31, 31, GROUND)

# ── Pine trees — left cluster ─────────────────────────────────────────────────
def pine(tip_r, tip_c, layers=4, width_start=1):
    """Draw a layered pine. tip is the top pixel."""
    for i in range(layers):
        half = width_start + i
        r = tip_r + i * 2
        for c in range(tip_c - half, tip_c + half + 1):
            col = TREE_L if c == tip_c - half or c == tip_c + half else TREE_M
            if i == 0: col = TREE_L
            px(r, c, col)
            if i > 0:
                px(r+1, c, TREE_D if c != tip_c - half and c != tip_c + half else TREE_M)
    # trunk
    px(tip_r + layers*2,   tip_c, TRUNK)
    px(tip_r + layers*2+1, tip_c, TRUNK)

pine(8,  3, layers=4)    # far left tree
pine(10, 7, layers=3)    # slightly right
pine(7,  1, layers=3)    # very left

# ── Pine trees — right cluster ────────────────────────────────────────────────
pine(9,  28, layers=4)
pine(11, 30, layers=3)
pine(8,  26, layers=3)

# ── Cabin ─────────────────────────────────────────────────────────────────────
# Positioned centre-ish: cols 11-20, rows 14-25
cabin_left  = 11
cabin_right = 20
cabin_top   = 18   # top of walls
cabin_bot   = 24   # bottom of walls

# Walls
rect(cabin_top, cabin_left, cabin_bot, cabin_right, WALL_D)
# Moonlit left face (light comes from upper-right)
for r in range(cabin_top, cabin_bot+1):
    px(r, cabin_left,   WALL_S)
    px(r, cabin_left+1, WALL_D)
# Moonlit right side highlight
for r in range(cabin_top, cabin_bot+1):
    px(r, cabin_right,   WALL_L)
    px(r, cabin_right-1, WALL_L)

# Roof — gable, 3 rows above cabin_top
roof_peak_r = cabin_top - 4
roof_peak_c = (cabin_left + cabin_right) // 2   # col 15

for i in range(5):  # roof rows
    r = roof_peak_r + i
    left_edge  = roof_peak_c - i
    right_edge = roof_peak_c + i
    for c in range(left_edge, right_edge + 1):
        col = ROOF_L if c >= roof_peak_c else ROOF_D
        if c == left_edge or c == right_edge: col = ROOF_D
        if r == roof_peak_r: col = ROOF_L
        px(r, c, col)
    # Snow on roof edge
    px(r, left_edge,  SNOW)
    px(r, right_edge, SNOW)
# Snow ridge at peak
px(roof_peak_r, roof_peak_c, SNOW)
px(roof_peak_r, roof_peak_c-1, SNOW)

# Chimney
chim_c = cabin_left + 3
vline(chim_c,   roof_peak_r - 3, roof_peak_r + 1, CHIM)
vline(chim_c+1, roof_peak_r - 3, roof_peak_r + 1, CHIM)
# Smoke puffs
px(roof_peak_r-4, chim_c,   SMOKE)
px(roof_peak_r-5, chim_c+1, SMOKE)
px(roof_peak_r-5, chim_c-1, SMOKE)
px(roof_peak_r-6, chim_c,   SMOKE)

# Window left
win_r = cabin_top + 2
win_c = cabin_left + 2
# Glow behind window (1px border of glow)
rect(win_r-1, win_c-1, win_r+2, win_c+2, WIN_G)
# Window frame
rect(win_r, win_c, win_r+1, win_c+1, WIN_G2)
px(win_r,   win_c,   WIN_GL)

# Window right
win_c2 = cabin_right - 3
rect(win_r-1, win_c2-1, win_r+2, win_c2+2, WIN_G)
rect(win_r, win_c2, win_r+1, win_c2+1, WIN_G2)
px(win_r, win_c2, WIN_GL)

# Door centre
door_c = (cabin_left + cabin_right) // 2
door_r_top = cabin_top + 2
door_r_bot = cabin_bot
rect(door_r_top, door_c-1, door_r_bot, door_c+1, DOOR_D)
# Door lit side
vline(door_c+1, door_r_top, door_r_bot, DOOR_L)
# Door knob
px(door_r_top + 3, door_c + 1, MOON)

# Window glow spill on ground
for c in range(win_c-1, win_c+3):
    px(cabin_bot+1, c, WIN_G)
for c in range(win_c2-1, win_c2+3):
    px(cabin_bot+1, c, WIN_G)

# ── Render ────────────────────────────────────────────────────────────────────
def make_image(scale):
    img = Image.new('RGBA', (W*scale, H*scale), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    for r in range(H):
        for c in range(W):
            color = grid[r][c]
            x0, y0 = c*scale, r*scale
            draw.rectangle([x0, y0, x0+scale-1, y0+scale-1], fill=color + (255,))

    # Rounded corners (mask)
    mask = Image.new('L', (W*scale, H*scale), 0)
    md = ImageDraw.Draw(mask)
    radius = scale * 4
    md.rounded_rectangle([0,0,W*scale-1,H*scale-1], radius=radius, fill=255)
    img.putalpha(mask)
    return img

out_dir = os.path.join(os.path.dirname(__file__), 'public')

img512 = make_image(16)   # 32*16 = 512
img512.save(os.path.join(out_dir, 'icon-512.png'))
print('Wrote icon-512.png')

img192 = make_image(6)    # 32*6 = 192
img192.save(os.path.join(out_dir, 'icon-192.png'))
print('Wrote icon-192.png')

# ── SVG (pixel-art rects, no anti-aliasing) ───────────────────────────────────
S = 16   # SVG pixel size (gives 512×512 viewBox)
svg_lines = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">']
# Background rounded rect
svg_lines.append(f'  <rect width="512" height="512" rx="64" fill="rgb{BG}"/>')
for r in range(H):
    for c in range(W):
        color = grid[r][c]
        if color == BG:
            continue
        x, y = c*S, r*S
        rgb = f'rgb({color[0]},{color[1]},{color[2]})'
        svg_lines.append(f'  <rect x="{x}" y="{y}" width="{S}" height="{S}" fill="{rgb}"/>')
svg_lines.append('</svg>')

svg_path = os.path.join(out_dir, 'icon.svg')
with open(svg_path, 'w') as f:
    f.write('\n'.join(svg_lines))
print('Wrote icon.svg')
print('Done.')
