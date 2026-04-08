from __future__ import annotations

import re
from typing import Optional, Tuple, List


def is_hex(value: str) -> bool:
  return bool(re.fullmatch(r"[0-9A-Fa-f]+", value))


def normalize_hex4(value: str) -> str:
  raw = value.strip()
  if raw.lower().startswith("0x"):
    raw = raw[2:]
  if not raw:
    return ""
  if is_hex(raw):
    return raw.upper().zfill(4)
  return raw.upper()


def parse_int(text: str) -> Optional[int]:
  s = text.strip()
  if not s:
    return None
  try:
    return int(s, 10)
  except ValueError:
    if s.lower().startswith("0x"):
      try:
        return int(s, 16)
      except ValueError:
        return None
    return None


def split_ipv4(ip: str) -> Optional[Tuple[int, int, int, int]]:
  parts = ip.strip().split(".")
  if len(parts) != 4:
    return None
  try:
    nums = tuple(int(p, 10) for p in parts)
  except ValueError:
    return None
  if any(n < 0 or n > 255 for n in nums):
    return None
  return nums  # type: ignore[return-value]


def normalize_mac(value: str) -> str:
  raw = value.strip().replace("-", ":")
  parts = [p for p in raw.split(":") if p != ""]
  if len(parts) != 6:
    return value.strip().upper()
  norm = []
  for p in parts:
    if len(p) == 1:
      p = "0" + p
    norm.append(p.upper())
  return ":".join(norm)


def mac_octets(value: str) -> Optional[List[str]]:
  m = normalize_mac(value)
  parts = m.split(":")
  if len(parts) != 6:
    return None
  for p in parts:
    if len(p) != 2 or not is_hex(p):
      return None
  return [p.upper() for p in parts]


def starts_with_ew0(name: str) -> bool:
  return bool(re.match(r"^EW0..", name.upper()))


def starts_with_ew8(name: str) -> bool:
  return bool(re.match(r"^EW8..", name.upper()))

