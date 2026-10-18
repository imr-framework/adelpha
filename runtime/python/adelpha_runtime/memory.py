"""Release working memory after an Engineering Studio simulation request."""

from __future__ import annotations

import gc


def release_simulation_memory() -> None:
    """Drop matplotlib figures and return unused heap to the OS-facing allocator."""
    try:
        import matplotlib.pyplot as plt

        plt.close("all")
    except Exception:
        pass
    try:
        import torch

        if hasattr(torch, "cuda") and torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    gc.collect()
    try:
        import ctypes

        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass
