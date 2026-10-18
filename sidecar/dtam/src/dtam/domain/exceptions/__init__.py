"""Domain-layer exceptions."""

from dtam.core.exceptions import DtamError, ErrorSeverity, Recoverability


class DomainError(DtamError):
    """Raised when a domain invariant is violated."""

    code = "DOMAIN_ERROR"
    severity = ErrorSeverity.ERROR
    recoverability = Recoverability.FATAL


class InvalidUnitError(DomainError):
    code = "INVALID_UNIT"


class InvalidMeasurementError(DomainError):
    code = "INVALID_MEASUREMENT"


__all__ = [
    "DomainError",
    "InvalidMeasurementError",
    "InvalidUnitError",
]
