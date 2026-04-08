from __future__ import annotations

import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import DefaultDict, Dict, Iterable, List, Sequence, Set, Tuple, TypedDict

from scd_utils import normalize_hex4, normalize_mac


# Security note – XXE (XML External Entity):
# xml.etree.ElementTree does NOT expand external entities and raises ParseError
# if it encounters a DOCTYPE that declares them (Python ≥ 3.8 with expat 2.4+).
# This tool only parses local files supplied by the operator, so the attack
# surface is already minimal. No additional hardening is required for this
# use-case, but the dependency on defusedxml can be added if the parser is ever
# exposed to untrusted network input.


def local_name(tag: str) -> str:
  """Strip the XML namespace URI (if present) and return the local element name."""
  if "}" in tag:
    return tag.split("}", 1)[1]
  return tag


def attr(el: ET.Element, key: str) -> str:
  """Return a stripped attribute value, or an empty string if the attribute is absent."""
  return (el.attrib.get(key) or "").strip()


def iter_by_tag(root: ET.Element, name: str) -> Iterable[ET.Element]:
  """Yield all descendant elements whose local tag name matches *name*."""
  for el in root.iter():
    if local_name(el.tag) == name:
      yield el


def children_by_tag(parent: ET.Element, name: str) -> List[ET.Element]:
  """Return direct children of *parent* whose local tag name matches *name*."""
  return [ch for ch in list(parent) if local_name(ch.tag) == name]


def as_bool(text: str, default: bool = False) -> bool:
  """Parse an XML boolean attribute ('true'/'false'/'1'/'0'/'yes') with an optional default."""
  if text == "":
    return default
  return text.strip().lower() in {"true", "1", "yes"}


def normalize_ptype(value: str) -> str:
  """Normalise an SCL P-element type attribute to uppercase with hyphens/underscores removed."""
  return value.strip().upper().replace("-", "").replace("_", "")


def normalize_service_type(value: str) -> str:
  """Map a raw serviceType string to one of 'GOOSE', 'SV', or 'MMS'."""
  s = value.strip().upper()
  if "GOOSE" in s:
    return "GOOSE"
  if "SMV" in s or "SAMPLED" in s or s == "SV":
    return "SV"
  if "REPORT" in s or "MMS" in s:
    return "MMS"
  return s


@dataclass
class FcdaSignal:
  ld_inst: str
  prefix: str
  ln_class: str
  ln_inst: str
  do_name: str
  da_name: str


@dataclass
class AccessPointInfo:
  ied_name: str
  ap_name: str
  subnetwork: str
  subnetwork_type: str
  ip: str
  netmask: str
  gateway: str


@dataclass
class MmsControl:
  ied_name: str
  ap_name: str
  ld_inst: str
  control_name: str
  rpt_id: str
  dataset: str
  conf_rev: str
  indexed: bool


@dataclass
class GooseControl:
  ied_name: str
  ap_name: str
  ld_inst: str
  control_name: str
  dataset: str
  conf_rev: str
  mac_address: str
  appid: str
  vlan_id: str
  vlan_priority: str
  min_time: str
  max_time: str
  subscribers: List[str] = field(default_factory=list)


@dataclass
class SvControl:
  ied_name: str
  ap_name: str
  ld_inst: str
  control_name: str
  smv_id: str
  dataset: str
  conf_rev: str
  mac_address: str
  appid: str
  vlan_id: str
  vlan_priority: str
  subscribers: List[str] = field(default_factory=list)


class _AccessPointEntry(TypedDict):
  ap_name: str
  subnetwork: str
  ip: str
  netmask: str
  gateway: str


class _IedEntry(TypedDict):
  access_points: List[_AccessPointEntry]


@dataclass
class ExtRefBinding:
  owner_ied: str
  src_ied: str
  src_cb: str
  service_type: str  # "GOOSE", "SV", or ""


@dataclass
class ParseOutput:
  ied_names: List[str]
  IED_dict: Dict[str, _IedEntry]
  MMS_dict: Dict[str, List[Dict[str, object]]]
  MMS_dataset_dict: Dict[str, Dict[str, List[str]]]
  GOOSE_dict: Dict[str, List[Dict[str, object]]]
  GOOSE_dataset_dict: Dict[str, Dict[str, List[str]]]
  SV_dict: Dict[str, List[Dict[str, object]]]
  SV_dataset_dict: Dict[str, Dict[str, List[str]]]
  access_points: List[AccessPointInfo]
  mms_controls: List[MmsControl]
  goose_controls: List[GooseControl]
  sv_controls: List[SvControl]
  # Extended fields for IEC_001-009 checks
  lnode_ied_names: Set[str] = field(default_factory=set)  # IED names in Substation/LNode (IEC_005)
  lntype_refs: Dict[str, Set[str]] = field(default_factory=dict)  # ied → lnType refs (IEC_006)
  lntype_defs: Set[str] = field(default_factory=set)  # defined LNodeType ids (IEC_006)
  extref_bindings: List["ExtRefBinding"] = field(default_factory=list)  # all ExtRef bindings (IEC_003)
  dataset_fcda_counts: Dict[Tuple[str, str], int] = field(default_factory=dict)  # (ied,ds) → count (IEC_007)


def parse_p_entries(parent: ET.Element) -> Dict[str, str]:
  """Collect all <P type="..."> child entries beneath *parent* into a normalised dict."""
  out: Dict[str, str] = {}
  for p in iter_by_tag(parent, "P"):
    ptype = normalize_ptype(attr(p, "type"))
    value = (p.text or "").strip()
    if not ptype or not value:
      continue
    out[ptype] = value
  return out


def first_of(mapping: Dict[str, str], keys: Sequence[str]) -> str:
  """Return the first non-empty value found in *mapping* for any of the given *keys*."""
  for key in keys:
    if mapping.get(key):
      return mapping[key]
  return ""


def parse_scd(path: Path) -> ParseOutput:
  """Parse an IEC 61850 SCL/SCD file and return a fully populated ParseOutput.

  Traverses Communication, IED, and DataSet sections in a single pass.
  Subscriber resolution is performed by matching ExtRef serviceType attributes
  against GSEControl / SampledValueControl block names.

  Args:
    path: Absolute path to a .scd / .ssd / .cid / .icd / .xml file.

  Returns:
    ParseOutput containing structured access-point, control-block, and dataset data.

  Raises:
    xml.etree.ElementTree.ParseError: If the file is not well-formed XML.
    FileNotFoundError: If *path* does not exist.
  """
  tree = ET.parse(path)
  root = tree.getroot()

  ied_names: List[str] = []

  ap_comm: Dict[Tuple[str, str], AccessPointInfo] = {}
  goose_comm: Dict[Tuple[str, str, str, str], Dict[str, str]] = {}
  sv_comm: Dict[Tuple[str, str, str, str], Dict[str, str]] = {}

  subnet_ip_registry: DefaultDict[str, List[Tuple[str, str, str]]] = defaultdict(list)

  for sub in iter_by_tag(root, "SubNetwork"):
    sub_name = attr(sub, "name") or "(unnamed-subnetwork)"
    sub_type = attr(sub, "type")
    for cap in children_by_tag(sub, "ConnectedAP"):
      ied_name = attr(cap, "iedName")
      ap_name = attr(cap, "apName")

      p_map: Dict[str, str] = {}
      for phys in children_by_tag(cap, "PhysConn"):
        p_map.update(parse_p_entries(phys))
      for addr in children_by_tag(cap, "Address"):
        p_map.update(parse_p_entries(addr))
      p_map.update(parse_p_entries(cap))

      ip = first_of(p_map, ("IP", "IPADDRESS"))
      netmask = first_of(p_map, ("IPSUBNET", "SUBNETMASK", "NETMASK"))
      gateway = first_of(p_map, ("IPGATEWAY", "GATEWAY"))

      ap_info = AccessPointInfo(
        ied_name=ied_name,
        ap_name=ap_name,
        subnetwork=sub_name,
        subnetwork_type=sub_type,
        ip=ip,
        netmask=netmask,
        gateway=gateway,
      )
      ap_comm[(ied_name, ap_name)] = ap_info
      if ip:
        subnet_ip_registry[sub_name].append((ip, ied_name, ap_name))

      for gse in children_by_tag(cap, "GSE"):
        gse_map: Dict[str, str] = {}
        for addr in children_by_tag(gse, "Address"):
          gse_map.update(parse_p_entries(addr))
        gse_map.update(parse_p_entries(gse))
        key = (ied_name, ap_name, attr(gse, "ldInst"), attr(gse, "cbName"))
        gse_info = {
          "mac-address": first_of(gse_map, ("MACADDRESS", "MAC")),
          "appid": first_of(gse_map, ("APPID",)),
          "vlan-priority": first_of(gse_map, ("VLANPRIORITY",)),
          "vlan-id": first_of(gse_map, ("VLANID",)),
          "MinTime": attr(gse, "MinTime") or attr(gse, "minTime"),
          "MaxTime": attr(gse, "MaxTime") or attr(gse, "maxTime"),
        }
        goose_comm[key] = gse_info

      for smv in children_by_tag(cap, "SMV"):
        smv_map: Dict[str, str] = {}
        for addr in children_by_tag(smv, "Address"):
          smv_map.update(parse_p_entries(addr))
        smv_map.update(parse_p_entries(smv))
        key = (ied_name, ap_name, attr(smv, "ldInst"), attr(smv, "cbName"))
        sv_comm[key] = {
          "mac-address": first_of(smv_map, ("MACADDRESS", "MAC")),
          "appid": first_of(smv_map, ("APPID",)),
          "vlan-priority": first_of(smv_map, ("VLANPRIORITY",)),
          "vlan-id": first_of(smv_map, ("VLANID",)),
        }

  sub_map_goose: DefaultDict[Tuple[str, str, str], Set[str]] = defaultdict(set)
  sub_map_sv: DefaultDict[Tuple[str, str, str], Set[str]] = defaultdict(set)

  for ied in iter_by_tag(root, "IED"):
    subscriber_ied = attr(ied, "name")
    for ext in iter_by_tag(ied, "ExtRef"):
      src_ied = attr(ext, "iedName")
      if not src_ied:
        continue
      src_ld = attr(ext, "srcLDInst") or attr(ext, "ldInst")
      src_cb = attr(ext, "srcCBName")
      service = normalize_service_type(attr(ext, "serviceType"))
      key = (src_ied, src_ld, src_cb)
      if service == "GOOSE":
        sub_map_goose[key].add(subscriber_ied)
      elif service == "SV":
        sub_map_sv[key].add(subscriber_ied)

  dataset_fcda_by_ld: Dict[Tuple[str, str, str], List[FcdaSignal]] = {}
  dataset_fcda_by_name: DefaultDict[Tuple[str, str], List[List[FcdaSignal]]] = defaultdict(list)

  access_points: List[AccessPointInfo] = []
  mms_controls: List[MmsControl] = []
  goose_controls: List[GooseControl] = []
  sv_controls: List[SvControl] = []

  for ied in iter_by_tag(root, "IED"):
    ied_name = attr(ied, "name")
    ied_names.append(ied_name)

    for ap in children_by_tag(ied, "AccessPoint"):
      ap_name = attr(ap, "name")
      ap_info = ap_comm.get((ied_name, ap_name)) or AccessPointInfo(
        ied_name=ied_name,
        ap_name=ap_name,
        subnetwork="",
        subnetwork_type="",
        ip="",
        netmask="",
        gateway="",
      )
      access_points.append(ap_info)

      for ldev in iter_by_tag(ap, "LDevice"):
        ld_inst = attr(ldev, "inst")

        for ds in iter_by_tag(ldev, "DataSet"):
          ds_name = attr(ds, "name")
          fcdas: List[FcdaSignal] = []
          for fcda in children_by_tag(ds, "FCDA"):
            fcdas.append(
              FcdaSignal(
                ld_inst=attr(fcda, "ldInst") or ld_inst,
                prefix=attr(fcda, "prefix"),
                ln_class=attr(fcda, "lnClass"),
                ln_inst=attr(fcda, "lnInst"),
                do_name=attr(fcda, "doName"),
                da_name=attr(fcda, "daName"),
              )
            )
          dataset_fcda_by_ld[(ied_name, ld_inst, ds_name)] = fcdas
          dataset_fcda_by_name[(ied_name, ds_name)].append(fcdas)

        for rc in iter_by_tag(ldev, "ReportControl"):
          rpt_id = attr(rc, "rptID") or attr(rc, "name")
          mms_controls.append(
            MmsControl(
              ied_name=ied_name,
              ap_name=ap_name,
              ld_inst=ld_inst,
              control_name=attr(rc, "name"),
              rpt_id=rpt_id,
              dataset=attr(rc, "datSet"),
              conf_rev=attr(rc, "confRev"),
              indexed=as_bool(attr(rc, "indexed"), default=True),
            )
          )

        for gcb in iter_by_tag(ldev, "GSEControl"):
          cb_name = attr(gcb, "name")
          gse_info = goose_comm.get((ied_name, ap_name, ld_inst, cb_name), {})
          subscribers = set()
          subscribers |= sub_map_goose.get((ied_name, ld_inst, cb_name), set())
          subscribers |= sub_map_goose.get((ied_name, ld_inst, ""), set())
          subscribers |= sub_map_goose.get((ied_name, "", ""), set())
          goose_controls.append(
            GooseControl(
              ied_name=ied_name,
              ap_name=ap_name,
              ld_inst=ld_inst,
              control_name=cb_name,
              dataset=attr(gcb, "datSet"),
              conf_rev=attr(gcb, "confRev"),
              mac_address=normalize_mac(gse_info.get("mac-address", "")),
              appid=normalize_hex4(gse_info.get("appid", "")),
              vlan_id=gse_info.get("vlan-id", ""),
              vlan_priority=gse_info.get("vlan-priority", ""),
              min_time=gse_info.get("MinTime", ""),
              max_time=gse_info.get("MaxTime", ""),
              subscribers=sorted(s for s in subscribers if s),
            )
          )

        for scb in list(iter_by_tag(ldev, "SampledValueControl")) + list(iter_by_tag(ldev, "SMVControl")):
          cb_name = attr(scb, "name")
          smv_info = sv_comm.get((ied_name, ap_name, ld_inst, cb_name), {})
          subscribers = set()
          subscribers |= sub_map_sv.get((ied_name, ld_inst, cb_name), set())
          subscribers |= sub_map_sv.get((ied_name, ld_inst, ""), set())
          subscribers |= sub_map_sv.get((ied_name, "", ""), set())
          sv_controls.append(
            SvControl(
              ied_name=ied_name,
              ap_name=ap_name,
              ld_inst=ld_inst,
              control_name=cb_name,
              smv_id=attr(scb, "smvID"),
              dataset=attr(scb, "datSet"),
              conf_rev=attr(scb, "confRev"),
              mac_address=normalize_mac(smv_info.get("mac-address", "")),
              appid=normalize_hex4(smv_info.get("appid", "")),
              vlan_id=smv_info.get("vlan-id", ""),
              vlan_priority=smv_info.get("vlan-priority", ""),
              subscribers=sorted(s for s in subscribers if s),
            )
          )

  def resolve_dataset(ied_name: str, ld_inst: str, dataset: str) -> List[FcdaSignal]:
    if "/" in dataset:
      ld, ds_name = dataset.split("/", 1)
      return dataset_fcda_by_ld.get((ied_name, ld, ds_name), [])
    direct = dataset_fcda_by_ld.get((ied_name, ld_inst, dataset), [])
    if direct:
      return direct
    many = dataset_fcda_by_name.get((ied_name, dataset), [])
    if many:
      return many[0]
    return []

  def mms_signal(ied_name: str, s: FcdaSignal) -> str:
    signal = f"{ied_name}{s.ld_inst}/{s.prefix}{s.ln_class}{s.ln_inst}"
    if s.do_name:
      signal += f".{s.do_name}"
    return signal

  def process_signal(ied_name: str, s: FcdaSignal) -> str:
    signal = f"{ied_name}{s.ld_inst}/{s.prefix}{s.ln_class}{s.ln_inst}"
    if s.do_name:
      signal += f".{s.do_name}"
    if s.da_name:
      signal += f".{s.da_name}"
    return signal

  IED_dict: DefaultDict[str, _IedEntry] = defaultdict(lambda: _IedEntry(access_points=[]))
  for ap in access_points:
    IED_dict[ap.ied_name]["access_points"].append(
      _AccessPointEntry(
        ap_name=ap.ap_name,
        subnetwork=ap.subnetwork,
        ip=ap.ip,
        netmask=ap.netmask,
        gateway=ap.gateway,
      )
    )

  MMS_dict: Dict[str, List[Dict[str, object]]] = defaultdict(list)
  MMS_dataset_dict: Dict[str, Dict[str, List[str]]] = defaultdict(dict)
  for c in mms_controls:
    MMS_dict[c.ied_name].append(
      {
        "rptID": c.rpt_id,
        "dataset": c.dataset,
        "confRev": c.conf_rev,
        "indexed": c.indexed,
      }
    )
    signals = [mms_signal(c.ied_name, s) for s in resolve_dataset(c.ied_name, c.ld_inst, c.dataset)]
    MMS_dataset_dict[c.ied_name][c.dataset] = signals

  GOOSE_dict: Dict[str, List[Dict[str, object]]] = defaultdict(list)
  GOOSE_dataset_dict: Dict[str, Dict[str, List[str]]] = defaultdict(dict)
  for c in goose_controls:
    GOOSE_dict[c.ied_name].append(
      {
        "controlBlockName": c.control_name,
        "dataset": c.dataset,
        "confRev": c.conf_rev,
        "mac-address": c.mac_address,
        "appid": c.appid,
        "vlan-priority": c.vlan_priority,
        "vlan-id": c.vlan_id,
        "MinTime": c.min_time,
        "MaxTime": c.max_time,
        "subscribers": c.subscribers,
      }
    )
    signals = [process_signal(c.ied_name, s) for s in resolve_dataset(c.ied_name, c.ld_inst, c.dataset)]
    GOOSE_dataset_dict[c.ied_name][c.dataset] = signals

  SV_dict: Dict[str, List[Dict[str, object]]] = defaultdict(list)
  SV_dataset_dict: Dict[str, Dict[str, List[str]]] = defaultdict(dict)
  for c in sv_controls:
    SV_dict[c.ied_name].append(
      {
        "smvID": c.smv_id,
        "controlBlockName": c.control_name,
        "dataset": c.dataset,
        "confRev": c.conf_rev,
        "mac-address": c.mac_address,
        "appid": c.appid,
        "vlan-priority": c.vlan_priority,
        "vlan-id": c.vlan_id,
        "subscribers": c.subscribers,
      }
    )
    signals = [process_signal(c.ied_name, s) for s in resolve_dataset(c.ied_name, c.ld_inst, c.dataset)]
    SV_dataset_dict[c.ied_name][c.dataset] = signals

  # --- IEC_005: collect IED names referenced in Substation/LNode elements ---
  lnode_ied_names: Set[str] = set()
  for lnode in iter_by_tag(root, "LNode"):
    ln_ied = attr(lnode, "iedName")
    if ln_ied:
      lnode_ied_names.add(ln_ied)

  # --- IEC_006: collect lnType references per IED + DataTypeTemplates defined types ---
  lntype_refs: Dict[str, Set[str]] = defaultdict(set)
  for ied in iter_by_tag(root, "IED"):
    ied_n = attr(ied, "name")
    for ln_el in list(iter_by_tag(ied, "LN0")) + list(iter_by_tag(ied, "LN")):
      ln_type = attr(ln_el, "lnType")
      if ln_type:
        lntype_refs[ied_n].add(ln_type)

  lntype_defs: Set[str] = set()
  for dt in iter_by_tag(root, "DataTypeTemplates"):
    for lnt in iter_by_tag(dt, "LNodeType"):
      lnt_id = attr(lnt, "id")
      if lnt_id:
        lntype_defs.add(lnt_id)

  # --- IEC_003: collect all ExtRef bindings with source IED and CB info ---
  extref_bindings: List[ExtRefBinding] = []
  for ied in iter_by_tag(root, "IED"):
    owner = attr(ied, "name")
    for ext in iter_by_tag(ied, "ExtRef"):
      src_ied = attr(ext, "iedName")
      if not src_ied:
        continue
      src_cb = attr(ext, "srcCBName")
      svc = normalize_service_type(attr(ext, "serviceType"))
      extref_bindings.append(ExtRefBinding(
        owner_ied=owner,
        src_ied=src_ied,
        src_cb=src_cb,
        service_type=svc,
      ))

  # --- IEC_007: dataset FCDA counts ---
  dataset_fcda_counts: Dict[Tuple[str, str], int] = {}
  for (ied_n2, _ld, ds_name2), fcdas_list in dataset_fcda_by_ld.items():
    key2 = (ied_n2, ds_name2)
    if key2 not in dataset_fcda_counts or dataset_fcda_counts[key2] > len(fcdas_list):
      dataset_fcda_counts[key2] = len(fcdas_list)

  return ParseOutput(
    ied_names=ied_names,
    IED_dict=dict(IED_dict),
    MMS_dict=dict(MMS_dict),
    MMS_dataset_dict={k: dict(v) for k, v in MMS_dataset_dict.items()},
    GOOSE_dict=dict(GOOSE_dict),
    GOOSE_dataset_dict={k: dict(v) for k, v in GOOSE_dataset_dict.items()},
    SV_dict=dict(SV_dict),
    SV_dataset_dict={k: dict(v) for k, v in SV_dataset_dict.items()},
    access_points=access_points,
    mms_controls=mms_controls,
    goose_controls=goose_controls,
    sv_controls=sv_controls,
    lnode_ied_names=lnode_ied_names,
    lntype_refs=dict(lntype_refs),
    lntype_defs=lntype_defs,
    extref_bindings=extref_bindings,
    dataset_fcda_counts=dataset_fcda_counts,
  )

