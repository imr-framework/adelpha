"""Thermal PINN MLP: N(t, T0, T*, tau) -> T_hat with IC-satisfying ansatz."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import torch
    from torch import nn
else:
    try:
        import torch
        from torch import nn
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "Thermal PINN requires the 'pinn' extra. "
            "Install with: uv sync --extra pinn"
        ) from exc


class ThermalPINN(nn.Module):
    """MLP with ansatz ``T_hat = T0 + t * N(...)`` so ``T_hat(0) = T0``.

    Inputs ``[..., 4]`` are ``[t_s, T0_c, T_star_c, tau_s]``.
    """

    INPUT_SIZE = 4
    OUTPUT_SIZE = 1

    def __init__(self, hidden: int = 64, depth: int = 3) -> None:
        super().__init__()
        if depth < 1:
            raise ValueError("depth must be >= 1")
        layers: list[nn.Module] = []
        in_features = self.INPUT_SIZE
        for _ in range(depth):
            layers.append(nn.Linear(in_features, hidden))
            layers.append(nn.GELU())
            in_features = hidden
        layers.append(nn.Linear(in_features, self.OUTPUT_SIZE))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        t_s = x[..., 0]
        t0_c = x[..., 1]
        residual = self.net(x).squeeze(-1)
        return t0_c + t_s * residual
