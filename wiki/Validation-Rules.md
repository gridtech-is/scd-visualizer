# Validation Rules

SCD Visualizer runs **26 structural checks** plus **XSD schema validation** on every loaded file.

Issues are classified by severity:
- **Error** — violates a hard rule; must be fixed
- **Warning** — potential problem; review recommended

---

## Landsnet checks (LNET_001–018)

Site-specific rules for Landsnet substation projects.

| Code | Severity | Description |
|------|----------|-------------|
| `LNET_001` | Error | Duplicate IED name |
| `LNET_002` | Error | Duplicate ConnectedAP IP address |
| `LNET_003` | Warning | IED description missing or empty |
| `LNET_004` | Warning | IED manufacturer missing or empty |
| `LNET_005` | Warning | IED type missing or empty |
| `LNET_006` | Warning | IED configVersion missing or empty |
| `LNET_007` | Error | GSEControl missing address element |
| `LNET_008` | Error | SampledValueControl missing address element |
| `LNET_009` | Error | Duplicate GSE/SMV MAC address |
| `LNET_010` | Error | GSEControl VLAN-PRIORITY below minimum (configurable) |
| `LNET_011` | Error | SampledValueControl VLAN-PRIORITY below minimum |
| `LNET_012` | Error | GSEControl MinTime below minimum (configurable) |
| `LNET_013` | Error | GSEControl MaxTime above maximum (configurable) |
| `LNET_014` | Warning | IED has no GSEControl (no GOOSE publishing) |
| `LNET_015` | Error | Duplicate GSE/SMV APPID |
| `LNET_016` | Error | ConnectedAP IP address is not a valid IPv4 address |
| `LNET_017` | Error | ConnectedAP subnet mask is not valid |
| `LNET_018` | Warning | IED has no SampledValueControl (no SV publishing) |

Thresholds for LNET_010–013 are read from `validation_config.json`.

---

## General IEC 61850 checks (IEC_001–008)

Standard structural rules applicable to any IEC 61850 SCD file.

| Code | Severity | Description |
|------|----------|-------------|
| `IEC_001` | Warning | GOOSE subscription (ExtRef) not resolved to a known publisher dataset |
| `IEC_002` | Warning | SV subscription (ExtRef) not resolved to a known publisher dataset |
| `IEC_003` | Error | ExtRef element missing required binding attributes (`ldInst`, `lnClass`, `doName`) |
| `IEC_004` | Warning | IED name does not match expected naming convention |
| `IEC_005` | Warning | IED not referenced in any Substation hierarchy (no LNode link) |
| `IEC_006` | Warning | LN lnType reference has no matching DataTypeTemplates entry |
| `IEC_007` | Warning | GSEControl or SampledValueControl dataset contains no FCDA entries |
| `IEC_008` | Error | confRev attribute is zero or missing on a control block |

---

## XSD schema validation (SCL_XSD_001)

The full IEC 61850-6 XML schema is validated using `xmllint-wasm`. The SCL edition is auto-detected:

| Header `version`/`revision` | Schema used |
|-----------------------------|-------------|
| `2007` / `B` | Edition 2 (2007B) |
| `2007` / `B4` | Edition 2.1 (2007B4) |

Schema issues are reported as `SCL_XSD_001_<line>` with the exact xmllint error message.

---

## Waiving checks

In the **Issues** view, individual check codes can be waived. A waived check is excluded from the issue count in the top bar and from the health gauge. Waived codes are stored in `localStorage` per browser session.

To waive a check: click the waive button on any issue row in the Issues List view.

---

## Configuring thresholds

Edit `validation_config.json` at the project root to adjust LNET_010–013 thresholds:

```json
{
  "goose": {
    "vlan_priority_min": 4,
    "min_time_ms": 2,
    "max_time_ms": 1000
  },
  "sv": {
    "vlan_priority_min": 4
  }
}
```
