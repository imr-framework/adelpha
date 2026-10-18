import numpy as np
from scipy.constants import mu_0
from scipy.special import ellipk, ellipe
from pulp import (
    LpProblem, LpMinimize, LpVariable, LpInteger, LpContinuous,
    lpSum, COIN_CMD, value
)
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Rectangle

import csv
import sys

# Force matplotlib sizing in VS Code
import matplotlib as mpl
mpl.rcParams['figure.dpi'] = 100
mpl.rcParams['savefig.dpi'] = 150

# =============================================================================
# 1. COIL PARAMETERS — CHANGE THESE
# =============================================================================

coil_length = 0.18         # meters
coil_radius = 0.03         # meters (inner radius where windings start)
M = 45                     # number of grooves
N = 60                     # number of field evaluation points
n_max = 1                  # max forward windings per groove
n_min = -1                 # max bucking windings per groove
former_thickness = 0.005   # 5 mm

# AWG 20 wire
wire_diameter_bare = 0.812e-3
wire_radius_bare = wire_diameter_bare / 2
wire_diameter_insulated = 0.879e-3

# Operating frequency
f_operating = 10.64e6  # Hz

# Target field
TARGET_PROFILE = 'uniform'
PROFILE_KWARGS = {}
ALLOW_BUCKING = True
GROOVE_SPACING = 'uniform'

# Field map resolution
FIELD_MAP_RESOLUTION = 0.003  # meters (3 mm for speed, use 0.001 for final)

# =============================================================================
# 2. PRINT CONFIGURATION
# =============================================================================

print("╔══════════════════════════════════════════════════════════════╗")
print("║                     RF COIL DESIGN                           ║")
print("╠══════════════════════════════════════════════════════════════╣")
print(f"║  Coil length:        {coil_length*100:8.2f} cm                       ║")
print(f"║  Coil inner radius:  {coil_radius*100:8.2f} cm                       ║")
print(f"║  Coil inner diameter:{coil_radius*200:8.2f} cm                       ║")
print(f"║  Former thickness:   {former_thickness*1000:8.2f} mm                       ║")
print(f"║  Wire:               AWG 20 (∅ {wire_diameter_bare*1000:.3f} mm)              ║")
print(f"║  Grooves:            {M:8d}                            ║")
print(f"║  Max turns/groove:   +{n_max} / {n_min}                            ║")
print(f"║  Target profile:     {TARGET_PROFILE:<20s}                ║")
print(f"║  Bucking:            {'YES' if ALLOW_BUCKING else 'NO':<20s}                ║")
print(f"║  Frequency:          {f_operating/1e6:8.3f} MHz                      ║")
print("╚══════════════════════════════════════════════════════════════╝")

# =============================================================================
# 3. GROOVE POSITIONS
# =============================================================================

def get_groove_positions(coil_length, M, spacing='sqrt'):
    if spacing == 'uniform':
        return np.linspace(-coil_length/2, coil_length/2, M)
    else:
        raise ValueError(f"Unknown spacing: {spacing}")

groove_positions = get_groove_positions(coil_length, M, GROOVE_SPACING)
eval_fraction = 0.8
x_eval = np.linspace(-coil_length / 2 * eval_fraction, coil_length / 2 * eval_fraction, N)

# =============================================================================
# 4. TARGET FIELD PROFILE
# =============================================================================

def get_target_field(x_eval, profile='uniform', **kwargs):
    x_norm = (x_eval - x_eval.min()) / (x_eval.max() - x_eval.min())
    
    profiles = {
        'uniform': (np.ones_like(x_eval), "Uniform (flat)"),
    }
    
    if profile == 'custom':
        func = kwargs.get('func', lambda x: np.ones_like(x))
        return np.maximum(func(x_norm), 0), kwargs.get('description', "Custom")
    
    if profile not in profiles:
        raise ValueError(f"Unknown profile: '{profile}'. Options: {list(profiles.keys())}")
    
    B, desc = profiles[profile]
    return np.maximum(B, 0), desc

B_target_norm, profile_description = get_target_field(x_eval, TARGET_PROFILE, **PROFILE_KWARGS)
print(f"\nTarget profile: {profile_description}")

# =============================================================================
# 5. BIOT-SAVART FIELD MATRIX
# =============================================================================

def b1_single_loop_on_axis(loop_x, loop_radius, eval_x):
    """On-axis B-field: B = μ₀IR²/(2(R²+d²)^(3/2))"""
    dx = eval_x - loop_x
    return mu_0 * loop_radius**2 / (2.0 * (loop_radius**2 + dx**2)**1.5)

def b1_single_loop_off_axis(loop_x, loop_radius, eval_x, eval_y, n_seg=500):
    """
    Full Biot-Savart for a circular loop at arbitrary (x,y,0) field points.
    Loop in y-z plane at x=loop_x.
    """
    R = loop_radius
    theta = np.linspace(0, 2*np.pi, n_seg, endpoint=False)
    dtheta = 2*np.pi / n_seg
    
    # Wire segments
    w_x = np.full(n_seg, loop_x)
    w_y = R * np.cos(theta)
    w_z = R * np.sin(theta)
    dl_x = np.zeros(n_seg)
    dl_y = -R * np.sin(theta) * dtheta
    dl_z = R * np.cos(theta) * dtheta
    
    # Field point
    rx = eval_x - w_x
    ry = eval_y - w_y
    rz = 0.0 - w_z
    r_mag = np.sqrt(rx**2 + ry**2 + rz**2)
    
    # dl × r
    cx = dl_y*rz - dl_z*ry
    cy = dl_z*rx - dl_x*rz
    cz = dl_x*ry - dl_y*rx
    
    Bx = np.sum(cx / r_mag**3)
    By = np.sum(cy / r_mag**3)
    Bz = np.sum(cz / r_mag**3)
    
    return mu_0/(4*np.pi) * np.array([Bx, By, Bz])

# Build on-axis field matrix for optimization
print("Building field matrix...")
B_matrix = np.zeros((N, M))
for m in range(M):
    B_matrix[:, m] = b1_single_loop_on_axis(groove_positions[m], coil_radius, x_eval)

# Scale target
if TARGET_PROFILE == 'uniform':
    scale_factor = np.mean(B_matrix.sum(axis=1)) * 0.5
else:
    nonzero = B_target_norm > 0.01
    scale_factor = (n_max * np.mean(B_matrix.sum(axis=1))) / np.mean(B_target_norm[nonzero]) if np.any(nonzero) else 1.0
    scale_factor *= 0.5

B_target_scaled = B_target_norm * scale_factor
valid_mask = B_target_scaled > 1e-12
B_matrix_valid = B_matrix[valid_mask, :]
B_target_valid = B_target_scaled[valid_mask]
N_valid = np.sum(valid_mask)
print(f"Valid evaluation points: {N_valid}/{N}")

# =============================================================================
# 6. INTEGER LINEAR PROGRAMMING OPTIMIZATION
# =============================================================================

def optimize_coil_windings(B_matrix, B_target, n_max=4, n_min=-4, allow_bucking=True):
    """Minimize max relative error via ILP."""
    N_pts, M_coils = B_matrix.shape
    lb = n_min if allow_bucking else 0
    
    prob = LpProblem("RF_Coil_Opt", LpMinimize)
    n_vars = [LpVariable(f"n_{m}", lowBound=lb, upBound=n_max, cat=LpInteger) for m in range(M_coils)]
    epsilon = LpVariable("eps", lowBound=0, cat=LpContinuous)
    
    prob += epsilon
    for j in range(N_pts):
        field_j = lpSum([B_matrix[j, m] * n_vars[m] for m in range(M_coils)])
        prob += (field_j - B_target[j] <= epsilon * B_target[j], f"u_{j}")
        prob += (B_target[j] - field_j <= epsilon * B_target[j], f"l_{j}")
    
    solver = COIN_CMD(msg=1, timeLimit=120)
    if not solver.available():
        raise RuntimeError(
            "CBC solver is unavailable. Install it in this Python environment with:\n"
            f"  {sys.executable} -m pip install 'pulp[cbc]'\n"
            "Alternatively, install CBC and make its executable available on PATH."
        )
    prob.solve(solver)
    
    n_windings = np.array([int(round(value(n_vars[m]))) for m in range(M_coils)])
    max_rel_error = value(epsilon)
    return n_windings, max_rel_error

print("\n" + "="*50)
print("RUNNING OPTIMIZATION...")
print("="*50)
n_windings, max_error = optimize_coil_windings(
    B_matrix_valid, B_target_valid, n_max=n_max, n_min=n_min, allow_bucking=ALLOW_BUCKING
)

n_forward = np.maximum(n_windings, 0)
n_bucking = np.minimum(n_windings, 0)

print(f"\n✓ Optimization complete!")
print(f"  Max relative error: {max_error*100:.2f}%")
print(f"  Forward turns: {n_forward.sum()}")
print(f"  Bucking turns: {abs(n_bucking.sum())}")
print(f"  Winding pattern: {n_windings}")

# =============================================================================
# 7. INDUCTANCE CALCULATION
# =============================================================================

def self_inductance_loop(R, a_wire):
    """L = μ₀R[ln(8R/a) - 2]"""
    return mu_0 * R * (np.log(8.0 * R / a_wire) - 2.0)

def mutual_inductance_coaxial(R1, R2, d):
    """Mutual inductance via elliptic integrals."""
    if d < 1e-10 and abs(R1 - R2) < 1e-10:
        return self_inductance_loop(R1, R1 * 0.001) * 0.99
    
    k_sq = 4.0 * R1 * R2 / ((R1 + R2)**2 + d**2)
    k_sq = min(k_sq, 0.999999)
    k = np.sqrt(k_sq)
    K = ellipk(k_sq)
    E = ellipe(k_sq)
    return mu_0 * np.sqrt(R1 * R2) * ((2.0/k - k)*K - (2.0/k)*E)

def calculate_inductance(n_windings, groove_positions, coil_radius, 
                          wire_radius, wire_dia_ins, former_thickness):
    """
    Full inductance: expands grooves into individual turns at actual radii.
    L_total = s^T · L_matrix · s  where s_i = ±1 for current direction.
    """
    # Expand into individual turns
    turns = []
    for m in range(len(n_windings)):
        n_w = n_windings[m]
        if n_w == 0:
            continue
        sign = 1 if n_w > 0 else -1
        for t in range(abs(n_w)):
            r_turn = coil_radius + former_thickness + wire_dia_ins * (t + 0.5)
            turns.append({'x': groove_positions[m], 'R': r_turn, 'sign': sign, 'groove': m})
    
    N_turns = len(turns)
    if N_turns == 0:
        return 0, 0, 0, None, []
    
    # Build turn-by-turn inductance matrix
    L_mat = np.zeros((N_turns, N_turns))
    for i in range(N_turns):
        L_mat[i, i] = self_inductance_loop(turns[i]['R'], wire_radius)
        for j in range(i+1, N_turns):
            d = abs(turns[i]['x'] - turns[j]['x'])
            R1, R2 = turns[i]['R'], turns[j]['R']
            
            if d < 1e-10 and abs(R1 - R2) < 1e-10:
                M_ij = L_mat[i, i] * 0.98
            elif d < 1e-10:
                # Same groove, different layer — use formula with d→0
                k_sq = 4.0*R1*R2 / ((R1+R2)**2 + (wire_dia_ins*0.1)**2)
                k_sq = min(k_sq, 0.999999)
                k = np.sqrt(k_sq)
                M_ij = mu_0*np.sqrt(R1*R2)*((2.0/k - k)*ellipk(k_sq) - (2.0/k)*ellipe(k_sq))
            else:
                M_ij = mutual_inductance_coaxial(R1, R2, d)
            
            L_mat[i, j] = M_ij
            L_mat[j, i] = M_ij
    
    # Total inductance with signs
    signs = np.array([t['sign'] for t in turns], dtype=float)
    L_total = signs @ L_mat @ signs
    L_self_total = np.trace(L_mat)
    L_mutual_total = L_total - L_self_total
    
    return L_total, L_self_total, L_mutual_total, L_mat, turns

print("\nCalculating inductance...")
L_total, L_self_total, L_mutual_total, L_mat_turns, turns_list = calculate_inductance(
    n_windings, groove_positions, coil_radius, wire_radius_bare, 
    wire_diameter_insulated, former_thickness
)

# RF parameters
omega = 2 * np.pi * f_operating
X_L = omega * L_total
C_resonance = 1.0 / (omega**2 * L_total) if L_total > 0 else float('inf')
rho_cu = 1.68e-8
skin_depth = np.sqrt(2 * rho_cu / (omega * mu_0))
wire_length = sum(2 * np.pi * t['R'] for t in turns_list)
R_dc = rho_cu * wire_length / (np.pi * wire_radius_bare**2) if wire_length > 0 else 0
R_ac = rho_cu * wire_length / (2*np.pi*wire_radius_bare*skin_depth) if wire_radius_bare > skin_depth else R_dc
Q_factor = omega * L_total / R_ac if R_ac > 0 else 0

print("\n" + "═"*62)
print("           INDUCTANCE RESULTS (AWG 20)")
print("═"*62)
print(f"  Coil inner radius:    {coil_radius*100:.2f} cm")
print(f"  Coil length:          {coil_length*100:.2f} cm")
print(f"  Total |turns|:        {np.sum(np.abs(n_windings))}")
print(f"  Forward:              {n_forward.sum()}")
print(f"  Bucking:              {abs(n_bucking.sum())}")
print("─"*62)
print(f"  Self-inductance/turn: {self_inductance_loop(coil_radius, wire_radius_bare)*1e6:.4f} µH")
print(f"  Sum self-inductance:  {L_self_total*1e6:.3f} µH")
print(f"  Mutual contribution:  {L_mutual_total*1e6:.3f} µH")
print(f"  ─────────────────────────────────────────────────────")
print(f"  TOTAL INDUCTANCE:     {L_total*1e6:.3f} µH")
print("═"*62)
print(f"\n  RF PARAMETERS @ {f_operating/1e6:.3f} MHz")
print("─"*62)
print(f"  Reactance (XL):       {X_L:.2f} Ω")
print(f"  Tuning capacitance:   {C_resonance*1e12:.1f} pF")
print(f"  Wire length:          {wire_length:.3f} m")
print(f"  Skin depth:           {skin_depth*1e6:.1f} µm")
print(f"  DC resistance:        {R_dc*1000:.2f} mΩ")
print(f"  AC resistance:        {R_ac*1000:.2f} mΩ (×{R_ac/R_dc:.1f} vs DC)")
print(f"  Q factor:             {Q_factor:.0f}")
print("═"*62)

# =============================================================================
# 8. FIELD PERFORMANCE PLOTS
# =============================================================================

B_achieved = B_matrix @ n_windings

fig, axes = plt.subplots(3, 1, figsize=(12, 10))

# Target vs achieved
ax = axes[0]
ax.plot(x_eval*100, B_target_scaled*1e6, 'b-', lw=2, label=f'Target: {profile_description}')
ax.plot(x_eval*100, B_achieved*1e6, 'r--', lw=2, label='Achieved')
ax.set_xlabel('Position (cm)')
ax.set_ylabel('B₁ (µT per Amp)')
ax.set_title('Target vs Achieved B₁ Field (On-Axis)')
ax.legend(fontsize=10)
ax.grid(True, alpha=0.3)

# Error
ax = axes[1]
rel_error = np.zeros(N)
rel_error[valid_mask] = (B_achieved[valid_mask] - B_target_scaled[valid_mask]) / B_target_scaled[valid_mask]
ax.plot(x_eval[valid_mask]*100, rel_error[valid_mask]*100, 'k-', lw=1.5)
ax.axhline(0, color='gray', ls='--')
ax.set_xlabel('Position (cm)')
ax.set_ylabel('Relative Error (%)')
ax.set_title(f'Relative Error (max = {max_error*100:.2f}%)')
ax.grid(True, alpha=0.3)

# Winding pattern
ax = axes[2]
colors = ['#2171B5' if n > 0 else ('#CB181D' if n < 0 else '#CCCCCC') for n in n_windings]
bw = 0.7 * np.min(np.abs(np.diff(np.sort(groove_positions))))*100 if M > 1 else 1
ax.bar(groove_positions*100, n_windings, width=bw, color=colors, edgecolor='black', lw=0.5)
ax.axhline(0, color='black', lw=0.8)
ax.set_xlabel('Groove Position (cm)')
ax.set_ylabel('Windings')
ax.set_title(f'Winding Pattern (Fwd: {n_forward.sum()}, Buck: {abs(n_bucking.sum())})')
ax.set_ylim(n_min - 1, n_max + 1)
ax.grid(True, alpha=0.3, axis='y')
ax.legend(handles=[
    mpatches.Patch(color='#2171B5', label='Forward'),
    mpatches.Patch(color='#CB181D', label='Bucking')
], fontsize=10)

plt.tight_layout()
plt.savefig('01_field_performance.png', dpi=150, bbox_inches='tight')
plt.show()

# =============================================================================
# 9. COIL PHYSICAL VISUALIZATION
# =============================================================================

# Convert to cm for plotting
R_cm = coil_radius * 100
L_cm = coil_length * 100
ft_cm = former_thickness * 100
wd_cm = wire_diameter_insulated * 100

# Wire visual size: scale up so it's visible
min_vis = R_cm * 0.025
wire_vis_r = max(wd_cm/2, min_vis)

max_layers = max(np.max(np.abs(n_windings)), 1)
r_outer_cm = R_cm + ft_cm + max_layers * wd_cm

# ─── SIDE VIEW ───
fig, ax = plt.subplots(1, 1, figsize=(14, 7))

# Former (top and bottom)
ax.add_patch(Rectangle((-L_cm/2, R_cm), L_cm, ft_cm, 
             ec='saddlebrown', fc='wheat', lw=1.5, zorder=1))
ax.add_patch(Rectangle((-L_cm/2, -R_cm - ft_cm), L_cm, ft_cm,
             ec='saddlebrown', fc='wheat', lw=1.5, zorder=1))
# End caps
ax.add_patch(Rectangle((-L_cm/2 - ft_cm, -R_cm-ft_cm), ft_cm, 2*R_cm+2*ft_cm,
             ec='saddlebrown', fc='wheat', lw=1, alpha=0.5, zorder=1))
ax.add_patch(Rectangle((L_cm/2, -R_cm-ft_cm), ft_cm, 2*R_cm+2*ft_cm,
             ec='saddlebrown', fc='wheat', lw=1, alpha=0.5, zorder=1))

# Center axis
ax.axhline(0, color='gray', ls='-.', lw=0.5, zorder=0)

# Draw windings
for m, (pos, n_w) in enumerate(zip(groove_positions, n_windings)):
    if n_w == 0:
        continue
    color = '#2171B5' if n_w > 0 else '#CB181D'
    ec = '#08306B' if n_w > 0 else '#67000D'
    
    for w in range(abs(n_w)):
        r_pos = R_cm + ft_cm + wd_cm*(w+0.5)
        # Top
        ax.add_patch(plt.Circle((pos*100, r_pos), wire_vis_r, fc=color, ec=ec, lw=0.4, zorder=3))
        # Bottom
        ax.add_patch(plt.Circle((pos*100, -r_pos), wire_vis_r, fc=color, ec=ec, lw=0.4, zorder=3))

# Dimension: length
dim_y = -(R_cm + ft_cm + max_layers*wd_cm + R_cm*0.25)
ax.annotate('', xy=(L_cm/2, dim_y), xytext=(-L_cm/2, dim_y),
            arrowprops=dict(arrowstyle='<->', color='black', lw=1.5))
ax.text(0, dim_y - R_cm*0.1, f'L = {L_cm:.1f} cm', ha='center', fontsize=11, fontweight='bold')

# Dimension: diameter
dim_x = L_cm/2 + ft_cm + R_cm*0.15
ax.annotate('', xy=(dim_x, R_cm), xytext=(dim_x, -R_cm),
            arrowprops=dict(arrowstyle='<->', color='black', lw=1.5))
ax.text(dim_x + R_cm*0.08, 0, f'ID = {2*R_cm:.1f} cm', ha='left', va='center',
        fontsize=10, fontweight='bold', rotation=90)

# Outer diameter annotation
ax.text(-L_cm/2, r_outer_cm + R_cm*0.08,
        f'OD ≈ {2*r_outer_cm:.1f} cm (max)\nAWG 20, {max_layers} layers',
        fontsize=9, color='navy', va='bottom')

ax.set_title(f'RF Gradient Coil — Side View\n'
             f'{profile_description} | L={L_total*1e6:.1f} µH | Q≈{Q_factor:.0f} | '
             f'C={C_resonance*1e12:.0f} pF @ {f_operating/1e6:.3f} MHz',
             fontsize=12, fontweight='bold')
ax.set_xlabel('Axial Position (cm)')
ax.set_ylabel('Radial Position (cm)')
ax.set_aspect('equal')
pad = max(L_cm*0.12, 3)
ax.set_xlim(-L_cm/2 - pad, L_cm/2 + pad + R_cm*0.4)
ax.set_ylim(dim_y - R_cm*0.2, r_outer_cm + R_cm*0.3)
ax.grid(True, alpha=0.2)
ax.legend(handles=[
    mpatches.Patch(fc='#2171B5', ec='#08306B', label='Forward'),
    mpatches.Patch(fc='#CB181D', ec='#67000D', label='Bucking'),
    mpatches.Patch(fc='wheat', ec='saddlebrown', label='Former'),
], loc='lower right', fontsize=9)

plt.tight_layout()
plt.savefig('02_coil_side_view.png', dpi=150, bbox_inches='tight')
plt.show()

# ─── DEVELOPED VIEW ───
fig, ax = plt.subplots(1, 1, figsize=(14, 5))

ax.fill_between([-L_cm/2, L_cm/2], -0.3, 0, color='wheat', ec='saddlebrown', lw=1.5)
ax.axhline(0, color='saddlebrown', lw=1.5)

for m, (pos, n_w) in enumerate(zip(groove_positions, n_windings)):
    if n_w == 0:
        continue
    color = '#2171B5' if n_w > 0 else '#CB181D'
    marker = 'o' if n_w > 0 else 's'
    for w in range(abs(n_w)):
        ax.plot(pos*100, w+1, marker, color=color, ms=9, mec='black', mew=0.6)
    ax.text(pos*100, abs(n_w)+0.3, f'{n_w:+d}', ha='center', fontsize=7, color=color, fontweight='bold')

ax.set_xlabel('Axial Position (cm)')
ax.set_ylabel('Layer')
ax.set_title('Developed View — Winding Layers', fontsize=12, fontweight='bold')
ax.set_yticks(range(0, n_max+2))
ax.set_yticklabels(['Former'] + [f'Layer {i}' for i in range(1, n_max+2)])
ax.set_xlim(-L_cm/2 - 2, L_cm/2 + 2)
ax.set_ylim(-0.6, max(n_max, np.max(np.abs(n_windings)))+1.5)
ax.grid(True, alpha=0.3)
ax.legend(handles=[
    plt.Line2D([0],[0], marker='o', color='w', mfc='#2171B5', ms=10, mec='k', label='Forward'),
    plt.Line2D([0],[0], marker='s', color='w', mfc='#CB181D', ms=10, mec='k', label='Bucking'),
], loc='upper right', fontsize=10)

plt.tight_layout()
plt.savefig('03_coil_developed_view.png', dpi=150, bbox_inches='tight')
plt.show()

# ─── END VIEW ───
fig, ax = plt.subplots(1, 1, figsize=(8, 8))

theta_c = np.linspace(0, 2*np.pi, 200)
ax.plot(R_cm*np.cos(theta_c), R_cm*np.sin(theta_c), 'saddlebrown', lw=2, label=f'Former ID ({2*R_cm:.0f} cm)')
ax.plot(r_outer_cm*np.cos(theta_c), r_outer_cm*np.sin(theta_c), 
        'gray', lw=1, ls='--', label=f'Max OD ({2*r_outer_cm:.1f} cm)')

# Show windings distributed around circumference (representative)
n_angular = 24
idx_show = np.argmax(np.abs(n_windings))
for w in range(abs(n_windings[idx_show])):
    r_w = R_cm + ft_cm + wd_cm*(w+0.5)
    color = '#2171B5' if n_windings[idx_show] > 0 else '#CB181D'
    for k in range(n_angular):
        angle = 2*np.pi*k/n_angular
        ax.add_patch(plt.Circle((r_w*np.cos(angle), r_w*np.sin(angle)),
                     wire_vis_r*0.7, fc=color, ec='black', lw=0.3, alpha=0.7))

ax.plot(0, 0, '+k', ms=12, mew=1.5)
ax.annotate('', xy=(R_cm, 0), xytext=(0, 0),
            arrowprops=dict(arrowstyle='->', color='red', lw=2))
ax.text(R_cm/2, R_cm*0.08, f'R={R_cm:.1f} cm', ha='center', fontsize=10, color='red')

ax.set_xlabel('y (cm)')
ax.set_ylabel('z (cm)')
ax.set_title(f'End View (Groove #{idx_show+1}, n={n_windings[idx_show]:+d})', fontsize=12, fontweight='bold')
ax.set_aspect('equal')
ax.legend(loc='upper right', fontsize=9)
lim = r_outer_cm + 2
ax.set_xlim(-lim, lim)
ax.set_ylim(-lim, lim)
ax.grid(True, alpha=0.2)

plt.tight_layout()
plt.savefig('04_coil_end_view.png', dpi=150, bbox_inches='tight')
plt.show()

# =============================================================================
# 10. B1 FIELD MAP (2D, off-axis via Biot-Savart)
# =============================================================================

print("\nComputing 2D B₁ field map (this may take a minute)...")

fov_x = coil_length * 0.85
fov_y = coil_radius * 1.5
res = FIELD_MAP_RESOLUTION

x_map = np.arange(-fov_x/2, fov_x/2 + res, res)
y_map = np.arange(-fov_y/2, fov_y/2 + res, res)
Nx_map, Ny_map = len(x_map), len(y_map)

B1_map = np.zeros((Ny_map, Nx_map))

n_seg = 360
R = coil_radius
theta = np.linspace(0, 2*np.pi, n_seg, endpoint=False)
dtheta = 2*np.pi / n_seg

# Precompute wire geometry per groove
for m_idx, (pos, n_w) in enumerate(zip(groove_positions, n_windings)):
    if n_w == 0:
        continue
    
    # For each layer
    for layer in range(abs(n_w)):
        R_layer = coil_radius + former_thickness + wire_diameter_insulated*(layer+0.5)
        
        w_x = np.full(n_seg, pos)
        w_y = R_layer * np.cos(theta)
        w_z = R_layer * np.sin(theta)
        dl_x = np.zeros(n_seg)
        dl_y = -R_layer * np.sin(theta) * dtheta
        dl_z = R_layer * np.cos(theta) * dtheta
        
        sign = np.sign(n_w)
        
        for iy in range(Ny_map):
            yp = y_map[iy]
            
            ry_all = yp - w_y
            rz_all = 0.0 - w_z
            
            for ix in range(Nx_map):
                xp = x_map[ix]
                rx_all = xp - w_x
                r_mag = np.sqrt(rx_all**2 + ry_all**2 + rz_all**2)
                
                Bx = np.sum((dl_y*rz_all - dl_z*ry_all) / r_mag**3)
                By = np.sum((dl_z*rx_all - dl_x*rz_all) / r_mag**3)
                Bz = np.sum((dl_x*ry_all - dl_y*rx_all) / r_mag**3)
                
                B1_map[iy, ix] += sign * mu_0/(4*np.pi) * np.sqrt(Bx**2 + By**2 + Bz**2)
    
    # Progress
    if (m_idx+1) % 5 == 0:
        print(f"  Groove {m_idx+1}/{M} done...")

print("  Field map complete!")

# Plot field map
fig, axes = plt.subplots(2, 1, figsize=(13, 8))

# Absolute B1
ax = axes[0]
extent = [x_map[0]*100, x_map[-1]*100, y_map[0]*100, y_map[-1]*100]
vmax = np.percentile(np.abs(B1_map), 99) * 1e6
im = ax.imshow(B1_map*1e6, extent=extent, aspect='auto', cmap='hot', origin='lower',
               vmin=0, vmax=vmax)
plt.colorbar(im, ax=ax, label='|B₁| (µT/A)')
ax.set_xlabel('x (cm)')
ax.set_ylabel('y (cm)')
ax.set_title(f'B₁ Field Map — {profile_description}\n'
             f'L={L_total*1e6:.1f} µH | Fwd:{n_forward.sum()} Buck:{abs(n_bucking.sum())}')

# Normalized/target comparison on axis
ax = axes[1]
# Extract on-axis line from field map (y=0)
iy_center = Ny_map // 2
B1_on_axis_map = B1_map[iy_center, :]
# Also show at different y offsets
iy_offsets = [0, Ny_map//4, Ny_map//2, 3*Ny_map//4, Ny_map-1]
for iy in iy_offsets:
    label = f'y = {y_map[iy]*100:.1f} cm'
    ax.plot(x_map*100, B1_map[iy, :]*1e6, lw=1.2, label=label)

ax.set_xlabel('x (cm)')
ax.set_ylabel('|B₁| (µT/A)')
ax.set_title('B₁ Profiles at Different y-Offsets')
ax.legend(fontsize=8, ncol=2)
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('05_b1_field_map.png', dpi=150, bbox_inches='tight')
plt.show()

# =============================================================================
# 11. INDUCTANCE MATRIX VISUALIZATION
# =============================================================================

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# Turn-by-turn matrix
if L_mat_turns is not None and L_mat_turns.size > 0:
    ax = axes[0]
    im = ax.imshow(L_mat_turns*1e6, cmap='viridis', origin='lower')
    plt.colorbar(im, ax=ax, label='L or M (µH)')
    ax.set_xlabel('Turn index')
    ax.set_ylabel('Turn index')
    ax.set_title(f'Turn-by-Turn Inductance Matrix\n({len(turns_list)} total turns)')

# Groove-level contribution
ax = axes[1]
# Rebuild groove-level matrix for visualization
M_groove_vis = np.zeros((M, M))
for m1 in range(M):
    if n_windings[m1] == 0:
        continue
    for m2 in range(M):
        if n_windings[m2] == 0:
            continue
        d = abs(groove_positions[m1] - groove_positions[m2])
        R1 = coil_radius + former_thickness + wire_diameter_insulated * abs(n_windings[m1]) / 2
        R2 = coil_radius + former_thickness + wire_diameter_insulated * abs(n_windings[m2]) / 2
        if m1 == m2:
            M_groove_vis[m1, m2] = n_windings[m1]**2 * self_inductance_loop(R1, wire_radius_bare)
        else:
            M_groove_vis[m1, m2] = n_windings[m1] * n_windings[m2] * mutual_inductance_coaxial(R1, R2, d)

vabs = np.max(np.abs(M_groove_vis)) * 1e6
im = ax.imshow(M_groove_vis*1e6, cmap='RdBu_r', origin='lower', vmin=-vabs, vmax=vabs)
plt.colorbar(im, ax=ax, label='nᵢnⱼMᵢⱼ (µH)')
ax.set_xlabel('Groove index')
ax.set_ylabel('Groove index')
ax.set_title(f'Groove Inductance Contributions\nL_total = {L_total*1e6:.1f} µH (blue=bucking reduces L)')

plt.tight_layout()
plt.savefig('06_inductance_matrix.png', dpi=150, bbox_inches='tight')
plt.show()

# =============================================================================
# 12. FINAL SUMMARY
# =============================================================================

print("\n\n")
print("╔══════════════════════════════════════════════════════════════════════╗")
print("║                  COMPLETE DESIGN SUMMARY                             ║")
print("╠══════════════════════════════════════════════════════════════════════╣")
print(f"║  Profile:         {profile_description:<50}║")
print(f"║  Coil length:     {coil_length*100:.1f} cm                                            ║")
print(f"║  Coil ID:         {coil_radius*200:.1f} cm                                            ║")
print(f"║  Wire:            AWG 20                                            ║")
print(f"║  Forward turns:   {n_forward.sum():<5d}                                              ║")
print(f"║  Bucking turns:   {abs(n_bucking.sum()):<5d}                                              ║")
print(f"║  Field error:     {max_error*100:.2f}%                                             ║")
print("╠══════════════════════════════════════════════════════════════════════╣")
print(f"║  Inductance:      {L_total*1e6:.3f} µH                                          ║")
print(f"║  Reactance:       {X_L:.2f} Ω                                            ║")
print(f"║  Tuning cap:      {C_resonance*1e12:.1f} pF                                           ║")
print(f"║  Q factor:        {Q_factor:.0f}                                                  ║")
print(f"║  AC resistance:   {R_ac*1000:.2f} mΩ                                          ║")
print("╚══════════════════════════════════════════════════════════════════════╝")

# Winding table
print("\n  WINDING TABLE:")
print("  ┌────────┬───────────────┬──────────┬─────────┐")
print("  │ Groove │ Position (mm) │ Windings │  Type   │")
print("  ├────────┼───────────────┼──────────┼─────────┤")
for m in range(M):
    if n_windings[m] != 0:
        wtype = "FWD" if n_windings[m] > 0 else "BUCK"
        print(f"  │  {m+1:3d}   │   {groove_positions[m]*1000:+7.2f}   │   {n_windings[m]:+2d}   │  {wtype:4s}   │")
print("  └────────┴───────────────┴──────────┴─────────┘")
print(f"\n  Files saved: 01-06_*.png")

csv_path = "winding_table.csv"
with open(csv_path, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["Groove", "Position (mm)", "Windings", "Type"])
    for m in range(M):
        if n_windings[m] != 0:
            wtype = "FWD" if n_windings[m] > 0 else "BUCK"
            writer.writerow([
                m + 1,
                f"{groove_positions[m] * 1000:.2f}",
                n_windings[m],
                wtype,
            ])

print(f"\n  Files saved: 01-06_*.png, {csv_path}")
