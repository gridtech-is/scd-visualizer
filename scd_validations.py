from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, DefaultDict, Dict, List, Set, Tuple

import re

from scd_parser import ExtRefBinding, GooseControl, ParseOutput, SvControl
from scd_utils import (
  is_hex,
  mac_octets,
  normalize_hex4,
  parse_int,
  split_ipv4,
  starts_with_ew0,
  starts_with_ew8,
)

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG: Dict[str, Any] = {
  "goose_protection": {"appid_prefix": "80", "vlan_priority": 7, "min_time": 4, "max_time": 2000},
  "goose_standard": {"appid_prefix": "00", "vlan_priority": 4, "min_time": 10, "max_time": 10000},
  "sv": {"appid_prefix": "40", "vlan_priority_protection": 7, "vlan_priority_metered": 4},
}


def _load_config() -> Dict[str, Any]:
  config_path = Path(__file__).parent / "validation_config.json"
  if config_path.exists():
    try:
      with config_path.open(encoding="utf-8") as f:
        data = json.load(f)
      logger.debug("Loaded validation config from %s", config_path)
      return data
    except Exception as exc:
      logger.warning("Could not load %s (%s) — using built-in defaults", config_path, exc)
  return _DEFAULT_CONFIG


@dataclass
class ValidationSummary:
  check_id: str
  check_name: str
  status: str
  summary: str


@dataclass
class ValidationDetail:
  check_id: str
  status: str
  context: str
  message: str


@dataclass
class ValidationOutput:
  summaries: List[ValidationSummary]
  details: List[ValidationDetail]
  mms_errors: Dict[Tuple[str, str, str], Set[str]]
  goose_errors: Dict[Tuple[str, str], Set[str]]
  sv_errors: Dict[Tuple[str, str], Set[str]]


def run_validations(parsed: ParseOutput, config: Dict[str, Any] | None = None) -> ValidationOutput:
  """Run all 18 IEC 61850 validation checks against a parsed SCD model.

  Checks 1–6 cover IP/network topology rules (duplicate IED names, duplicate IPs,
  netmask/gateway conventions for 192.168.*, 10.30.*, and 172.25.* ranges).
  Checks 7–14 cover MMS and GOOSE control-block naming and MAC/APPID/timing rules.
  Checks 15–18 cover SV (Sampled Values) uniqueness and APPID/VLAN-priority rules.

  GOOSE and SV thresholds (VLAN priority, MinTime, MaxTime, APPID prefix) are
  read from *config* (or loaded from validation_config.json if *config* is None)
  so that site-specific values can be changed without editing this file.

  Args:
    parsed: Output of :func:`scd_parser.parse_scd`.
    config: Optional dict overriding the on-disk validation_config.json.
            Useful for testing or programmatic invocation.

  Returns:
    ValidationOutput with per-check summaries, detail rows, and error maps
    keyed by (ied_name, control_name) for GOOSE, SV, and MMS controls.
  """
  if config is None:
    config = _load_config()
  summaries: List[ValidationSummary] = []
  details: List[ValidationDetail] = []

  mms_errors: DefaultDict[Tuple[str, str, str], Set[str]] = defaultdict(set)
  goose_errors: DefaultDict[Tuple[str, str], Set[str]] = defaultdict(set)
  sv_errors: DefaultDict[Tuple[str, str], Set[str]] = defaultdict(set)

  def finalize(check_id: str, name: str, failures: List[Tuple[str, str]]) -> None:
    if not failures:
      summaries.append(ValidationSummary(check_id, name, "PASS", "No issues found"))
      details.append(ValidationDetail(check_id, "PASS", "-", "No issues found"))
      return
    summaries.append(ValidationSummary(check_id, name, "FAIL", f"{len(failures)} issue(s)"))
    for context, message in failures:
      details.append(ValidationDetail(check_id, "FAIL", context, message))

  ied_name_counts = Counter(parsed.ied_names)
  failures_1: List[Tuple[str, str]] = []
  for ied_name, count in ied_name_counts.items():
    if count > 1:
      failures_1.append((ied_name, f"Duplicate IED name appears {count} times"))
  finalize("1", "No duplicate IED names", failures_1)

  failures_2: List[Tuple[str, str]] = []
  subnet_to_ips: DefaultDict[str, List[Tuple[str, str, str]]] = defaultdict(list)
  for ap in parsed.access_points:
    if ap.subnetwork and ap.ip:
      subnet_to_ips[ap.subnetwork].append((ap.ip, ap.ied_name, ap.ap_name))
  for subnet, rows in subnet_to_ips.items():
    c = Counter(ip for ip, _, _ in rows)
    for ip, count in c.items():
      if count > 1:
        owners = [f"{ied}/{ap}" for i, ied, ap in rows if i == ip]
        failures_2.append((subnet, f"IP {ip} duplicated ({count}): {', '.join(owners)}"))
  finalize("2", "No duplicate IP in each subnet", failures_2)

  failures_3: List[Tuple[str, str]] = []
  octets: Set[int] = set()
  for ap in parsed.access_points:
    ip = ap.ip
    if not ip:
      continue
    parts = split_ipv4(ip)
    if not parts:
      failures_3.append((f"{ap.ied_name}/{ap.ap_name}", f"Invalid IPv4 address: {ip}"))
      continue
    if ip.startswith("10.30.200."):
      continue
    octets.add(parts[2])
  if len(octets) > 1:
    failures_3.append(("GLOBAL", f"Multiple 3rd octets found: {sorted(octets)}"))
  finalize("3", "All relevant IPs share one unique 3rd octet", failures_3)

  failures_4: List[Tuple[str, str]] = []
  for ap in parsed.access_points:
    if ap.ip.startswith("192.168."):
      if ap.netmask != "255.255.255.0" or ap.gateway != "0.0.0.0":
        failures_4.append(
          (
            f"{ap.ied_name}/{ap.ap_name}",
            f"Expected netmask=255.255.255.0 and gateway=0.0.0.0, got netmask={ap.netmask or '-'} gateway={ap.gateway or '-'}",
          )
        )
  finalize("4", "192.168.* netmask/gateway rule", failures_4)

  failures_5: List[Tuple[str, str]] = []
  for ap in parsed.access_points:
    if ap.ip.startswith("10.30."):
      if ap.netmask != "255.255.255.0" or ap.gateway != "0.0.0.0":
        failures_5.append(
          (
            f"{ap.ied_name}/{ap.ap_name}",
            f"Expected netmask=255.255.255.0 and gateway=0.0.0.0, got netmask={ap.netmask or '-'} gateway={ap.gateway or '-'}",
          )
        )
  finalize("5", "10.30.* netmask/gateway rule", failures_5)

  failures_6: List[Tuple[str, str]] = []
  for ap in parsed.access_points:
    if ap.ip.startswith("172.25."):
      parts = split_ipv4(ap.ip)
      expected_gateway = ""
      if parts:
        expected_gateway = f"{parts[0]}.{parts[1]}.{parts[2]}.254"
      gateway_ok = ap.gateway == expected_gateway if expected_gateway else False
      if ap.netmask != "255.255.255.0" or not gateway_ok:
        failures_6.append(
          (
            f"{ap.ied_name}/{ap.ap_name}",
            f"Expected netmask=255.255.255.0 and gateway={expected_gateway or '(invalid-ip)'}; got netmask={ap.netmask or '-'} gateway={ap.gateway or '-'}",
          )
        )
  finalize("6", "172.25.* netmask/gateway rule", failures_6)

  failures_7: List[Tuple[str, str]] = []
  for m in parsed.mms_controls:
    if not m.indexed:
      key = (m.ied_name, m.rpt_id, m.dataset)
      mms_errors[key].add("7")
      failures_7.append((f"{m.ied_name}/{m.control_name}", "indexed is not True"))
  finalize("7", "All MMS reports have indexed=True", failures_7)

  failures_8: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    ok_name = g.control_name.startswith("gc")
    expected_ds = f"g{g.control_name[2:]}" if ok_name else ""
    ok_dataset = bool(expected_ds) and g.dataset == expected_ds
    if not ok_name or not ok_dataset:
      goose_errors[(g.ied_name, g.control_name)].add("8")
      failures_8.append(
        (
          f"{g.ied_name}/{g.control_name}",
          f"Expected name starts with 'gc' and dataset='{expected_ds or '(n/a)'}', got dataset='{g.dataset}'",
        )
      )
  finalize("8", "GOOSE name/dataset naming rule", failures_8)

  failures_9: List[Tuple[str, str]] = []
  goose_by_mac: DefaultDict[str, List[GooseControl]] = defaultdict(list)
  goose_by_appid: DefaultDict[str, List[GooseControl]] = defaultdict(list)
  for g in parsed.goose_controls:
    if g.mac_address:
      goose_by_mac[g.mac_address].append(g)
    if g.appid:
      goose_by_appid[g.appid].append(g)
  for mac, items in goose_by_mac.items():
    if len(items) > 1:
      ctx = ", ".join(f"{x.ied_name}/{x.control_name}" for x in items)
      failures_9.append((ctx, f"Duplicate GOOSE MAC address {mac}"))
      for x in items:
        goose_errors[(x.ied_name, x.control_name)].add("9")
  for appid, items in goose_by_appid.items():
    if len(items) > 1:
      ctx = ", ".join(f"{x.ied_name}/{x.control_name}" for x in items)
      failures_9.append((ctx, f"Duplicate GOOSE APPID {appid}"))
      for x in items:
        goose_errors[(x.ied_name, x.control_name)].add("9")
  finalize("9", "No duplicate GOOSE MAC/APPID", failures_9)

  ip_by_ied_ap = {(ap.ied_name, ap.ap_name): ap.ip for ap in parsed.access_points}
  failures_10: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    ip = ip_by_ied_ap.get((g.ied_name, g.ap_name), "")
    ip_parts = split_ipv4(ip) if ip else None
    m_oct = mac_octets(g.mac_address) if g.mac_address else None
    if not ip_parts or not m_oct:
      goose_errors[(g.ied_name, g.control_name)].add("10")
      failures_10.append((f"{g.ied_name}/{g.control_name}", "Missing/invalid IP or MAC for station-id check"))
      continue
    expected = f"{ip_parts[2]:02X}"
    got = m_oct[-2]
    if expected != got:
      goose_errors[(g.ied_name, g.control_name)].add("10")
      failures_10.append((f"{g.ied_name}/{g.control_name}", f"Expected MAC 2nd-last octet {expected} from IP 3rd octet, got {got}"))
  finalize("10", "GOOSE MAC 2nd-last octet matches IP 3rd octet hex", failures_10)

  gp = config.get("goose_protection", _DEFAULT_CONFIG["goose_protection"])
  failures_11: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    if "P" not in g.control_name:
      continue
    errors = []
    m_oct = mac_octets(g.mac_address) if g.mac_address else None
    appid = normalize_hex4(g.appid)
    ap = gp["appid_prefix"]
    if not (len(appid) == 4 and is_hex(appid) and appid.upper().startswith(ap.upper())):
      errors.append(f"APPID must be 4 hex and start with {ap} (got {g.appid or '-'})")
    if m_oct and len(appid) == 4 and is_hex(appid):
      if appid[-2:] != m_oct[-1]:
        errors.append(f"APPID last two digits {appid[-2:]} must match MAC last octet {m_oct[-1]}")
    else:
      errors.append("Cannot compare APPID/MAC suffix due to missing/invalid value")
    vp = parse_int(g.vlan_priority)
    mt = parse_int(g.min_time)
    xt = parse_int(g.max_time)
    if vp != gp["vlan_priority"]:
      errors.append(f"vlan-priority must be {gp['vlan_priority']} (got {g.vlan_priority or '-'})")
    if mt != gp["min_time"]:
      errors.append(f"MinTime must be {gp['min_time']} (got {g.min_time or '-'})")
    if xt != gp["max_time"]:
      errors.append(f"MaxTime must be {gp['max_time']} (got {g.max_time or '-'})")
    if errors:
      goose_errors[(g.ied_name, g.control_name)].add("11")
      failures_11.append((f"{g.ied_name}/{g.control_name}", "; ".join(errors)))
  finalize("11", "GOOSE rule when control name includes 'P'", failures_11)

  gs = config.get("goose_standard", _DEFAULT_CONFIG["goose_standard"])
  failures_12: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    if "P" in g.control_name:
      continue
    errors = []
    m_oct = mac_octets(g.mac_address) if g.mac_address else None
    appid = normalize_hex4(g.appid)
    as_ = gs["appid_prefix"]
    if not (len(appid) == 4 and is_hex(appid) and appid.upper().startswith(as_.upper())):
      errors.append(f"APPID must be 4 hex and start with {as_} (got {g.appid or '-'})")
    if m_oct and len(appid) == 4 and is_hex(appid):
      if appid[-2:] != m_oct[-1]:
        errors.append(f"APPID last two digits {appid[-2:]} must match MAC last octet {m_oct[-1]}")
    else:
      errors.append("Cannot compare APPID/MAC suffix due to missing/invalid value")
    vp = parse_int(g.vlan_priority)
    mt = parse_int(g.min_time)
    xt = parse_int(g.max_time)
    if vp != gs["vlan_priority"]:
      errors.append(f"vlan-priority must be {gs['vlan_priority']} (got {g.vlan_priority or '-'})")
    if mt != gs["min_time"]:
      errors.append(f"MinTime must be {gs['min_time']} (got {g.min_time or '-'})")
    if xt != gs["max_time"]:
      errors.append(f"MaxTime must be {gs['max_time']} (got {g.max_time or '-'})")
    if errors:
      goose_errors[(g.ied_name, g.control_name)].add("12")
      failures_12.append((f"{g.ied_name}/{g.control_name}", "; ".join(errors)))
  finalize("12", "GOOSE rule when control name does not include 'P'", failures_12)

  failures_13: List[Tuple[str, str]] = []
  goose_by_ied: DefaultDict[str, List[str]] = defaultdict(list)
  for g in parsed.goose_controls:
    goose_by_ied[g.ied_name].append(g.control_name)
  for ied_name in sorted(set(parsed.ied_names)):
    if not starts_with_ew0(ied_name):
      continue
    names = goose_by_ied.get(ied_name, [])
    needed = ("gcPtrp", "gcPev", "gcInd")
    missing = [n for n in needed if not any(x.startswith(n) for x in names)]
    if missing:
      failures_13.append((ied_name, f"Missing required control blocks: {', '.join(missing)}"))
      for cb in names:
        goose_errors[(ied_name, cb)].add("13")
  finalize("13", "EW0** IEDs contain gcPtrp*, gcPev*, gcInd*", failures_13)

  failures_14: List[Tuple[str, str]] = []
  for ied_name in sorted(set(parsed.ied_names)):
    if not starts_with_ew8(ied_name):
      continue
    names = goose_by_ied.get(ied_name, [])
    needed = ("gcPtrp", "gcInd")
    missing = [n for n in needed if not any(x.startswith(n) for x in names)]
    if missing:
      failures_14.append((ied_name, f"Missing required control blocks: {', '.join(missing)}"))
      for cb in names:
        goose_errors[(ied_name, cb)].add("14")
  finalize("14", "EW8** IEDs contain gcPtrp*, gcInd*", failures_14)

  failures_15: List[Tuple[str, str]] = []
  sv_by_smv_id: DefaultDict[str, List[SvControl]] = defaultdict(list)
  sv_by_mac: DefaultDict[str, List[SvControl]] = defaultdict(list)
  sv_by_appid: DefaultDict[str, List[SvControl]] = defaultdict(list)
  for s in parsed.sv_controls:
    if s.smv_id:
      sv_by_smv_id[s.smv_id].append(s)
    if s.mac_address:
      sv_by_mac[s.mac_address].append(s)
    if s.appid:
      sv_by_appid[s.appid].append(s)
  for smv_id, items in sv_by_smv_id.items():
    if len(items) > 1:
      ctx = ", ".join(f"{x.ied_name}/{x.control_name}" for x in items)
      failures_15.append((ctx, f"Duplicate SV smvID {smv_id}"))
      for x in items:
        sv_errors[(x.ied_name, x.control_name)].add("15")
  for mac, items in sv_by_mac.items():
    if len(items) > 1:
      ctx = ", ".join(f"{x.ied_name}/{x.control_name}" for x in items)
      failures_15.append((ctx, f"Duplicate SV MAC {mac}"))
      for x in items:
        sv_errors[(x.ied_name, x.control_name)].add("15")
  for appid, items in sv_by_appid.items():
    if len(items) > 1:
      ctx = ", ".join(f"{x.ied_name}/{x.control_name}" for x in items)
      failures_15.append((ctx, f"Duplicate SV APPID {appid}"))
      for x in items:
        sv_errors[(x.ied_name, x.control_name)].add("15")
  finalize("15", "No duplicate SV smvID/MAC/APPID", failures_15)

  failures_16: List[Tuple[str, str]] = []
  for s in parsed.sv_controls:
    appid = normalize_hex4(s.appid)
    if not appid.startswith("4"):
      sv_errors[(s.ied_name, s.control_name)].add("16")
      failures_16.append((f"{s.ied_name}/{s.control_name}", f"SV APPID must start with 4 (got {s.appid or '-'})"))
  finalize("16", "All SV APPIDs start with 4", failures_16)

  failures_17: List[Tuple[str, str]] = []
  for s in parsed.sv_controls:
    ip = ip_by_ied_ap.get((s.ied_name, s.ap_name), "")
    ip_parts = split_ipv4(ip) if ip else None
    m_oct = mac_octets(s.mac_address) if s.mac_address else None
    if not ip_parts or not m_oct:
      sv_errors[(s.ied_name, s.control_name)].add("17")
      failures_17.append((f"{s.ied_name}/{s.control_name}", "Missing/invalid IP or MAC for station-id check"))
      continue
    expected = f"{ip_parts[2]:02X}"
    got = m_oct[-2]
    if expected != got:
      sv_errors[(s.ied_name, s.control_name)].add("17")
      failures_17.append((f"{s.ied_name}/{s.control_name}", f"Expected MAC 2nd-last octet {expected} from IP 3rd octet, got {got}"))
  finalize("17", "SV MAC 2nd-last octet matches IP 3rd octet hex", failures_17)

  sv_cfg = config.get("sv", _DEFAULT_CONFIG["sv"])
  failures_18: List[Tuple[str, str]] = []
  for s in parsed.sv_controls:
    errors = []
    m_oct = mac_octets(s.mac_address) if s.mac_address else None
    appid = normalize_hex4(s.appid)
    sv_ap = sv_cfg["appid_prefix"]
    if not (len(appid) == 4 and is_hex(appid) and appid.upper().startswith(sv_ap.upper())):
      errors.append(f"APPID must be 4 hex and start with {sv_ap} (got {s.appid or '-'})")
    if m_oct and len(appid) == 4 and is_hex(appid):
      if appid[-2:] != m_oct[-1]:
        errors.append(f"APPID last two digits {appid[-2:]} must match MAC last octet {m_oct[-1]}")
    else:
      errors.append("Cannot compare APPID/MAC suffix due to missing/invalid value")

    smv_suffix = (s.smv_id or "").upper()[-2:]
    vp = parse_int(s.vlan_priority)
    if "P" in smv_suffix:
      vp_expected = sv_cfg["vlan_priority_protection"]
      if vp != vp_expected:
        errors.append(f"smvID suffix contains P, vlan-priority must be {vp_expected} (got {s.vlan_priority or '-'})")
    elif "M" in smv_suffix:
      vp_expected = sv_cfg["vlan_priority_metered"]
      if vp != vp_expected:
        errors.append(f"smvID suffix contains M, vlan-priority must be {vp_expected} (got {s.vlan_priority or '-'})")

    if errors:
      sv_errors[(s.ied_name, s.control_name)].add("18")
      failures_18.append((f"{s.ied_name}/{s.control_name}", "; ".join(errors)))
  finalize("18", "SV APPID/MAC/vlan-priority rule", failures_18)

  # ── IEC_001: GOOSE subscription completeness ─────────────────────────────
  failures_iec1: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    if not g.subscribers:
      goose_errors[(g.ied_name, g.control_name)].add("IEC_001")
      failures_iec1.append((f"{g.ied_name}/{g.control_name}", "No confirmed GOOSE subscribers"))
  finalize("IEC_001", "GOOSE subscription completeness", failures_iec1)

  # ── IEC_002: SV subscription completeness ────────────────────────────────
  failures_iec2: List[Tuple[str, str]] = []
  for s in parsed.sv_controls:
    if not s.subscribers:
      sv_errors[(s.ied_name, s.control_name)].add("IEC_002")
      failures_iec2.append((f"{s.ied_name}/{s.control_name}", "No confirmed SV subscribers"))
  finalize("IEC_002", "SV subscription completeness", failures_iec2)

  # ── IEC_003: ExtRef fully resolved ───────────────────────────────────────
  failures_iec3: List[Tuple[str, str]] = []
  ied_name_set = set(parsed.ied_names)
  goose_cb_set = {(g.ied_name, g.control_name) for g in parsed.goose_controls}
  sv_cb_set = {(s.ied_name, s.control_name) for s in parsed.sv_controls}
  for binding in parsed.extref_bindings:
    if binding.src_ied not in ied_name_set:
      failures_iec3.append((
        f"{binding.owner_ied}→{binding.src_ied}",
        f"Referenced IED '{binding.src_ied}' not found in SCD",
      ))
      continue
    if binding.src_cb:
      if binding.service_type == "SV":
        cb_exists = (binding.src_ied, binding.src_cb) in sv_cb_set
      else:
        cb_exists = (binding.src_ied, binding.src_cb) in goose_cb_set or (binding.src_ied, binding.src_cb) in sv_cb_set
      if not cb_exists:
        failures_iec3.append((
          f"{binding.owner_ied}→{binding.src_ied}/{binding.src_cb}",
          f"Control block '{binding.src_cb}' not found on IED '{binding.src_ied}'",
        ))
  finalize("IEC_003", "ExtRef fully resolved", failures_iec3)

  # ── IEC_004: IED naming convention ───────────────────────────────────────
  IED_NAME_RE = re.compile(r"^[A-Z]{2,5}_[A-Z]_[A-Z0-9]{1,5}_EW[0-9]{3}$")
  failures_iec4: List[Tuple[str, str]] = []
  for ied_n in sorted(set(parsed.ied_names)):
    if not IED_NAME_RE.match(ied_n):
      failures_iec4.append((ied_n, f"Name '{ied_n}' does not match [A-Z]{{2,5}}_[A-Z]_[A-Z0-9]{{1,5}}_EW[0-9]{{3}}"))
  finalize("IEC_004", "IED naming convention", failures_iec4)

  # ── IEC_005: IED placed in substation hierarchy ───────────────────────────
  failures_iec5: List[Tuple[str, str]] = []
  for ied_n in sorted(set(parsed.ied_names)):
    if ied_n not in parsed.lnode_ied_names:
      failures_iec5.append((ied_n, f"IED '{ied_n}' has no LNode reference in Substation section"))
  finalize("IEC_005", "IED placed in substation hierarchy", failures_iec5)

  # ── IEC_006: DataTypeTemplates completeness ───────────────────────────────
  failures_iec6: List[Tuple[str, str]] = []
  for ied_n, lntypes in sorted(parsed.lntype_refs.items()):
    for lntype in sorted(lntypes):
      if lntype not in parsed.lntype_defs:
        failures_iec6.append((ied_n, f"lnType '{lntype}' referenced in IED '{ied_n}' not defined in DataTypeTemplates"))
  finalize("IEC_006", "DataTypeTemplates completeness", failures_iec6)

  # ── IEC_007: GOOSE/SV dataset not empty ──────────────────────────────────
  failures_iec7: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    if g.dataset:
      count = parsed.dataset_fcda_counts.get((g.ied_name, g.dataset))
      if count is not None and count == 0:
        goose_errors[(g.ied_name, g.control_name)].add("IEC_007")
        failures_iec7.append((f"{g.ied_name}/{g.control_name}", f"DataSet '{g.dataset}' is empty"))
  for s in parsed.sv_controls:
    if s.dataset:
      count = parsed.dataset_fcda_counts.get((s.ied_name, s.dataset))
      if count is not None and count == 0:
        sv_errors[(s.ied_name, s.control_name)].add("IEC_007")
        failures_iec7.append((f"{s.ied_name}/{s.control_name}", f"DataSet '{s.dataset}' is empty"))
  finalize("IEC_007", "GOOSE/SV dataset not empty", failures_iec7)

  # ── IEC_008: confRev consistency (non-zero confRev required) ─────────────
  failures_iec8: List[Tuple[str, str]] = []
  for g in parsed.goose_controls:
    if g.conf_rev in ("", "0"):
      goose_errors[(g.ied_name, g.control_name)].add("IEC_008")
      failures_iec8.append((f"{g.ied_name}/{g.control_name}", f"GOOSE confRev is '{g.conf_rev or '(missing)'}' — should be non-zero"))
  for s in parsed.sv_controls:
    if s.conf_rev in ("", "0"):
      sv_errors[(s.ied_name, s.control_name)].add("IEC_008")
      failures_iec8.append((f"{s.ied_name}/{s.control_name}", f"SV confRev is '{s.conf_rev or '(missing)'}' — should be non-zero"))
  finalize("IEC_008", "confRev consistency", failures_iec8)

  # ── IEC_009: EW8** IEDs must have SV controls ────────────────────────────
  failures_iec9: List[Tuple[str, str]] = []
  sv_ied_set = {s.ied_name for s in parsed.sv_controls}
  for ied_n in sorted(set(parsed.ied_names)):
    if starts_with_ew8(ied_n) and ied_n not in sv_ied_set:
      failures_iec9.append((ied_n, f"IED '{ied_n}' (EW8**) has no SampledValueControl"))
  finalize("IEC_009", "EW8** IEDs must have SV controls", failures_iec9)

  return ValidationOutput(
    summaries=summaries,
    details=details,
    mms_errors=dict(mms_errors),
    goose_errors=dict(goose_errors),
    sv_errors=dict(sv_errors),
  )

