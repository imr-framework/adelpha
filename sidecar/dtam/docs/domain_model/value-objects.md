---
icon: lucide/ruler
---

# Value objects

Value objects enforce unit-aware quantities.

## Temperature

```python
from dtam.domain import Temperature, TemperatureUnit

t = Temperature(value=25.0, unit=TemperatureUnit.CELSIUS)
t.to_kelvin()
t.as_celsius()
```

Values below absolute zero raise `InvalidUnitError`.

## Field strength

```python
from dtam.domain import FieldStrength, FieldStrengthUnit

b0 = FieldStrength(value=48.0, unit=FieldStrengthUnit.MILLITESLA)
b0.to_tesla()  # 0.048
```

## Frequency

```python
from dtam.domain import Frequency, FieldStrength

f0 = Frequency.from_field_strength(FieldStrength(value=0.048))
f0.to_hertz()
```

`Frequency.from_field_strength` uses the proton \(\gamma/2\pi\) constant exported as `PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T`.

## Uncertainty

`Uncertainty` requires at least one of `standard_deviation` or `confidence`.

!!! note
    Empty placeholder modules remain under `value_objects/` for gradient amplitude and signal quality. They are not implemented yet.
