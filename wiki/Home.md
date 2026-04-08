# SCD Visualizer

**SCD Visualizer** is a dual-stack tool for parsing, validating, and visualising IEC 61850 SCD/SCL substation configuration files.

It consists of:
- A **React/TypeScript browser application** (Vite) for interactive exploration and visual analysis
- A **Python CLI** for headless validation and CSV/report export in CI/CD pipelines

---

## Quick links

| Topic | Page |
|-------|------|
| Installation & setup | [[Getting Started]] |
| Browser app features | [[App Features]] |
| Validation rule reference | [[Validation Rules]] |
| Python CLI usage | [[Python CLI]] |
| Architecture & code structure | [[Architecture]] |
| Contributing | [[Contributing]] |

---

## What it does

- Parses `.scd`, `.cid`, `.icd`, `.iid`, `.ssd`, and `.xml` SCL files
- Runs **26 structural validation checks** (LNET_001–018 + IEC_001–008) plus full XSD schema validation
- Visualises IED topology, GOOSE/SV/Report subscriptions, network traffic, and Single Line Diagrams
- Compares two versions of a file and highlights added/modified/removed elements
- Exports results to CSV, Excel, or Landsnet compliance JSON
- Supports Landsnet-specific naming and VLAN conventions via a configurable `validation_config.json`

---

## Supported file types

| Extension | Description |
|-----------|-------------|
| `.scd` | System Configuration Description — full substation config |
| `.cid` | Configured IED Description |
| `.icd` | IED Capability Description |
| `.iid` | Instantiated IED Description |
| `.ssd` | System Specification Description |
| `.xml` | Generic SCL XML |

---

## Screenshot

> _(add a screenshot of the app here)_
