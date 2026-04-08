from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable, List, Sequence

from scd_parser import ParseOutput
from scd_validations import ValidationOutput


def write_csv(path: Path, header: Sequence[str], rows: Iterable[Sequence[object]]) -> None:
  with path.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(header)
    for row in rows:
      w.writerow(list(row))


def write_outputs(parsed: ParseOutput, validation: ValidationOutput, out_dir: Path) -> None:
  out_dir.mkdir(parents=True, exist_ok=True)

  validation_path = out_dir / "validation_results.csv"
  with validation_path.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["section", "name", "value", "details"])
    w.writerow(["totals", "defined_goose_controls", len(parsed.goose_controls), ""])
    w.writerow(["totals", "defined_sampled_values_controls", len(parsed.sv_controls), ""])
    w.writerow([])
    w.writerow(["main_check", "check_id", "status", "summary"])
    for s in validation.summaries:
      w.writerow([s.check_name, s.check_id, s.status, s.summary])
    w.writerow([])
    w.writerow(["detailed_check", "check_id", "status", "context", "message"])
    for d in validation.details:
      w.writerow(["detail", d.check_id, d.status, d.context, d.message])

  mms_rows = []
  for m in parsed.mms_controls:
    key = (m.ied_name, m.rpt_id, m.dataset)
    err = "Error" if validation.mms_errors.get(key) else ""
    mms_rows.append([m.ied_name, m.rpt_id, m.dataset, m.conf_rev, m.indexed, err])
  write_csv(
    out_dir / "out_MMS.csv",
    ["iedname(publisher)", "rptID", "dataset", "confrev", "indexed", "Error"],
    mms_rows,
  )

  mms_ds_rows: List[List[str]] = []
  for m in parsed.mms_controls:
    mms_ds_rows.append([m.ied_name, m.rpt_id, m.dataset, ""])
    signals = parsed.MMS_dataset_dict.get(m.ied_name, {}).get(m.dataset, [])
    for signal in signals:
      mms_ds_rows.append(["", "", "", f"  {signal}"])
  write_csv(
    out_dir / "out_MMS_datasets.csv",
    ["iedname(publisher)", "rptID", "dataset", "signal"],
    mms_ds_rows,
  )

  goose_rows = []
  for g in parsed.goose_controls:
    key = (g.ied_name, g.control_name)
    err = "Error" if validation.goose_errors.get(key) else ""
    goose_rows.append(
      [
        g.ied_name,
        g.control_name,
        g.dataset,
        g.conf_rev,
        g.mac_address,
        g.appid,
        g.vlan_id,
        g.vlan_priority,
        g.min_time,
        g.max_time,
        ";".join(g.subscribers),
        err,
      ]
    )
  write_csv(
    out_dir / "out_goose.csv",
    [
      "iedname(publisher)",
      "control blockname",
      "dataset name",
      "confrev",
      "mac-address",
      "appid",
      "vlan-id",
      "vlan-priority",
      "MinTime",
      "MaxTime",
      "subscribing IEDnames",
      "Error",
    ],
    goose_rows,
  )

  goose_ds_rows: List[List[str]] = []
  for g in parsed.goose_controls:
    goose_ds_rows.append([g.ied_name, g.control_name, g.dataset, ""])
    signals = parsed.GOOSE_dataset_dict.get(g.ied_name, {}).get(g.dataset, [])
    for signal in signals:
      goose_ds_rows.append(["", "", "", f"  {signal}"])
  write_csv(
    out_dir / "out_goose_datasets.csv",
    ["iedname(publisher)", "control blockname", "dataset", "signal"],
    goose_ds_rows,
  )

  sv_rows = []
  for s in parsed.sv_controls:
    key = (s.ied_name, s.control_name)
    err = "Error" if validation.sv_errors.get(key) else ""
    sv_rows.append(
      [
        s.ied_name,
        s.smv_id,
        s.control_name,
        s.dataset,
        s.conf_rev,
        s.mac_address,
        s.appid,
        s.vlan_id,
        s.vlan_priority,
        ";".join(s.subscribers),
        err,
      ]
    )
  write_csv(
    out_dir / "out_sv.csv",
    [
      "iedname(publisher)",
      "smvid",
      "control blockname",
      "dataset name",
      "confrev",
      "mac-address",
      "appid",
      "vlan-id",
      "vlan-priority",
      "subscribing IEDnames",
      "Error",
    ],
    sv_rows,
  )

  template_path = out_dir / "IEDs_SW_filter_template.csv"
  with template_path.open("w", encoding="utf-8") as f:
    for ied_name in sorted(set(parsed.ied_names)):
      f.write(f'{ied_name}:[["{ied_name}","{ied_name}"],["x/x"]]\n')

