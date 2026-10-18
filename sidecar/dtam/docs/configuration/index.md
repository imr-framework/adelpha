---
icon: lucide/settings-2
---

# Configuration

Configuration is externalized under `configs/` and loaded by `dtam.config`.

## Layering

``` text
app.yaml (+ logging.yaml)
        ↓
environments/<env>.yaml
        ↓
scanner_profiles/base.yaml  (optional merge)
        ↓
scanner_profiles/<scanner_id>.yaml
        ↓
runtime overrides (scanner_id, mode, environment)
```

`load_runtime_settings()` returns a validated `RuntimeSettings` object with:

- `app: AppConfig`
- `scanner: ScannerProfile`
- `mode: OperationalMode`
- `config_root: str`

## Important models

### `ScannerProfile`

Includes identity (`id`, `field_strength_t`, `architecture`), `capabilities`, `sensors`, `actuators`, `supported_actions`, optional `simulation` block, and `metadata`.

### `ScannerCapabilities`

Boolean flags such as `temperature_monitoring`, `frequency_compensation`, and `automatic_control`. Agents and planners must consult these before treating an intervention as executable.

### Logging

`LoggingConfig` fields: `level`, `json_logs`, `correlation_header`.

## Environment files

| File | Typical use |
| --- | --- |
| `development.yaml` | Local work; `DEBUG` logs; simulated scanner |
| `testing.yaml` | Pytest defaults; quieter logs |
| `production.yaml` | Advisory posture; points at `halbach_48mt` profile |

Production pointing at Halbach does **not** make `Halbach48mTAdapter.connect()` succeed. Hardware samples use the [device protocol](../platform/devices.md), not that adapter.

## Resolving the config root

1. Explicit `config_root` argument
2. `DTAM_CONFIG_DIR` environment variable
3. Repository `configs/` directory next to `src/`

Missing directories raise `ConfigurationError`.

## Device listener

Boards do not use Twin HTTP. The Twin lifespan starts a WebSocket listener when `devices.json` is found.

| Lookup | Path |
| --- | --- |
| Explicit | `ADELPHA_DEVICE_CONFIG` |
| Config dir | `devices.json` or `dtam/devices.json` under `ADELPHA_CONFIG_DIR` |
| DTAM dir | `devices.json` under `DTAM_CONFIG_DIR` |

See [Device protocol](../platform/devices.md). Tokens must be unique, random, and at least 24 characters. Restart the Twin after changing the file.
