"""48 mT Halbach scanner adapter package."""

from dtam.scanner_adapters.halbach_48mt.adapter import Halbach48mTAdapter
from dtam.scanner_adapters.halbach_48mt.capabilities import (
    halbach_48mt_capabilities,
    load_halbach_48mt_profile,
)

__all__ = [
    "Halbach48mTAdapter",
    "halbach_48mt_capabilities",
    "load_halbach_48mt_profile",
]
