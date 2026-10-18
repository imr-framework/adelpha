"""Physics residual for the lumped first-order thermal ODE."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import torch
else:
    try:
        import torch
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Thermal PINN requires the 'pinn' extra. "
            "Install with: uv sync --extra pinn"
        ) from exc

from dtam.digital_twin.models.thermal.pinn.network import ThermalPINN


def pack_features(
    t_s: torch.Tensor,
    t0_c: torch.Tensor,
    t_star_c: torch.Tensor,
    tau_s: torch.Tensor,
) -> torch.Tensor:
    """Stack feature columns into shape ``(N, 4)``."""
    return torch.stack([t_s, t0_c, t_star_c, tau_s], dim=-1)


def ode_rhs(
    t_hat: torch.Tensor,
    t_star_c: torch.Tensor,
    tau_s: torch.Tensor,
) -> torch.Tensor:
    """Right-hand side of dT/dt = (T* - T) / tau."""
    return (t_star_c - t_hat) / tau_s.clamp_min(1e-6)


def physics_residual(
    model: ThermalPINN,
    t_s: torch.Tensor,
    t0_c: torch.Tensor,
    t_star_c: torch.Tensor,
    tau_s: torch.Tensor,
) -> torch.Tensor:
    """Compute R = ∂T̂/∂t − (T* − T̂)/τ for collocation points."""
    t_req = t_s.detach().requires_grad_(True)
    features = pack_features(t_req, t0_c, t_star_c, tau_s)
    t_hat = model(features)
    d_t_hat = torch.autograd.grad(
        outputs=t_hat,
        inputs=t_req,
        grad_outputs=torch.ones_like(t_hat),
        create_graph=True,
        retain_graph=True,
        only_inputs=True,
    )[0]
    assert d_t_hat is not None
    return d_t_hat - ode_rhs(t_hat, t_star_c, tau_s)


def pinn_loss(
    model: ThermalPINN,
    *,
    t_data: torch.Tensor,
    t0_data: torch.Tensor,
    t_star_data: torch.Tensor,
    tau_data: torch.Tensor,
    t_obs: torch.Tensor,
    t_colloc: torch.Tensor,
    t0_colloc: torch.Tensor,
    t_star_colloc: torch.Tensor,
    tau_colloc: torch.Tensor,
    lambda_data: float = 1.0,
    lambda_phys: float = 1.0,
    lambda_ic: float = 1.0,
) -> tuple[torch.Tensor, dict[str, float]]:
    """Weighted data + physics + initial-condition loss."""
    features_data = pack_features(t_data, t0_data, t_star_data, tau_data)
    pred_data = model(features_data)
    loss_data = torch.mean((pred_data - t_obs) ** 2)

    residual = physics_residual(
        model, t_colloc, t0_colloc, t_star_colloc, tau_colloc
    )
    loss_phys = torch.mean(residual**2)

    t_zero = torch.zeros_like(t0_colloc)
    features_ic = pack_features(t_zero, t0_colloc, t_star_colloc, tau_colloc)
    pred_ic = model(features_ic)
    loss_ic = torch.mean((pred_ic - t0_colloc) ** 2)

    total = (
        lambda_data * loss_data
        + lambda_phys * loss_phys
        + lambda_ic * loss_ic
    )
    parts = {
        "data": float(loss_data.detach()),
        "phys": float(loss_phys.detach()),
        "ic": float(loss_ic.detach()),
        "total": float(total.detach()),
    }
    return total, parts
