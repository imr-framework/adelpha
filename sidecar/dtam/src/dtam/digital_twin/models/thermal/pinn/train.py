"""Train a thermal PINN on simulated plant rollouts."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import numpy as np

from dtam.config.paths import pinn_model_dir
from dtam.digital_twin.models.thermal.pinn.dataset import (
    generate_plant_rollouts,
    sample_collocation,
)
from dtam.digital_twin.models.thermal.pinn.export import export_checkpoint
from dtam.digital_twin.models.thermal.pinn.network import ThermalPINN
from dtam.digital_twin.models.thermal.pinn.physics import pinn_loss


def train_thermal_pinn(
    *,
    epochs: int = 200,
    n_rollouts: int = 48,
    n_steps: int = 30,
    dt_s: float = 2.0,
    hidden: int = 64,
    depth: int = 3,
    lr: float = 1e-3,
    lambda_data: float = 1.0,
    lambda_phys: float = 1.0,
    lambda_ic: float = 1.0,
    seed: int = 0,
    device: str | None = None,
) -> tuple[ThermalPINN, dict[str, Any]]:
    """Fit the PINN and return ``(model, training_meta)``."""
    import torch

    torch.manual_seed(seed)
    np.random.seed(seed)
    dev = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))

    batch = generate_plant_rollouts(
        n_rollouts=n_rollouts,
        n_steps=n_steps,
        dt_s=dt_s,
        seed=seed,
    )
    t_col, t0_col, ts_col, tau_col = sample_collocation(
        batch, n_points=max(256, len(batch.t_s) // 2), seed=seed + 1
    )

    model = ThermalPINN(hidden=hidden, depth=depth).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    def _t(arr: np.ndarray) -> torch.Tensor:
        return torch.as_tensor(arr, dtype=torch.float32, device=dev)

    t_data = _t(batch.t_s)
    t0_data = _t(batch.t0_c)
    t_star_data = _t(batch.t_star_c)
    tau_data = _t(batch.tau_s)
    t_obs = _t(batch.t_obs_c)
    t_colloc = _t(t_col)
    t0_colloc = _t(t0_col)
    t_star_colloc = _t(ts_col)
    tau_colloc = _t(tau_col)

    history: list[dict[str, float]] = []
    model.train()
    for epoch in range(epochs):
        opt.zero_grad(set_to_none=True)
        loss, parts = pinn_loss(
            model,
            t_data=t_data,
            t0_data=t0_data,
            t_star_data=t_star_data,
            tau_data=tau_data,
            t_obs=t_obs,
            t_colloc=t_colloc,
            t0_colloc=t0_colloc,
            t_star_colloc=t_star_colloc,
            tau_colloc=tau_colloc,
            lambda_data=lambda_data,
            lambda_phys=lambda_phys,
            lambda_ic=lambda_ic,
        )
        loss.backward()
        opt.step()
        if epoch % max(1, epochs // 10) == 0 or epoch == epochs - 1:
            history.append({"epoch": float(epoch), **parts})

    model.eval()
    meta: dict[str, Any] = {
        "epochs": epochs,
        "n_rollouts": n_rollouts,
        "n_steps": n_steps,
        "dt_s": dt_s,
        "hidden": hidden,
        "depth": depth,
        "seed": seed,
        "final_loss": history[-1] if history else {},
        "history_tail": history[-5:],
    }
    return model.cpu(), meta


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Train DTAM thermal PINN on ThermalPlantModel rollouts."
    )
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--n-rollouts", type=int, default=48)
    parser.add_argument("--n-steps", type=int, default=30)
    parser.add_argument("--hidden", type=int, default=64)
    parser.add_argument("--depth", type=int, default=3)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: data/models/pinn)",
    )
    parser.add_argument("--no-onnx", action="store_true")
    args = parser.parse_args(argv)

    model, meta = train_thermal_pinn(
        epochs=args.epochs,
        n_rollouts=args.n_rollouts,
        n_steps=args.n_steps,
        hidden=args.hidden,
        depth=args.depth,
        lr=args.lr,
        seed=args.seed,
    )
    out = args.out or pinn_model_dir()
    path = export_checkpoint(
        model, out, meta=meta, export_onnx=not args.no_onnx
    )
    print(f"Wrote thermal PINN checkpoint to {path}")
    print(f"Final loss parts: {meta.get('final_loss')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
