from scd_utils import (
  is_hex,
  normalize_hex4,
  parse_int,
  split_ipv4,
  normalize_mac,
  mac_octets,
  starts_with_ew0,
  starts_with_ew8,
)


def test_is_hex_basic():
  assert is_hex("0A1B")
  assert is_hex("ff")
  assert not is_hex("0x12")
  assert not is_hex("ZZ")


def test_normalize_hex4_variants():
  assert normalize_hex4("1") == "0001"
  assert normalize_hex4("0x1") == "0001"
  assert normalize_hex4("0x00ff") == "00FF"
  assert normalize_hex4("") == ""
  # Non-hex is uppercased but not padded
  assert normalize_hex4("GHI") == "GHI"


def test_parse_int_decimal_and_hex():
  assert parse_int("10") == 10
  assert parse_int("  42 ") == 42
  assert parse_int("0x10") == 16
  assert parse_int("0xFF") == 255
  assert parse_int("") is None
  assert parse_int("not-a-number") is None
  assert parse_int("0xZZ") is None


def test_split_ipv4_valid_and_invalid():
  assert split_ipv4("192.168.0.1") == (192, 168, 0, 1)
  assert split_ipv4(" 10.0.0.5 ") == (10, 0, 0, 5)
  assert split_ipv4("256.0.0.1") is None
  assert split_ipv4("1.2.3") is None
  assert split_ipv4("a.b.c.d") is None


def test_normalize_mac_and_octets():
  assert normalize_mac("1:2:3:4:5:6") == "01:02:03:04:05:06"
  assert normalize_mac("01-02-03-04-05-06") == "01:02:03:04:05:06"
  assert mac_octets("01:02:03:04:05:06") == ["01", "02", "03", "04", "05", "06"]
  # Invalid MAC should return None from mac_octets
  assert mac_octets("01:02:03:04:05") is None
  assert mac_octets("ZZ:02:03:04:05:06") is None


def test_ew_prefix_helpers():
  assert starts_with_ew0("EW012") is True
  assert starts_with_ew0("ew099") is True
  assert starts_with_ew0("EW812") is False

  assert starts_with_ew8("EW812") is True
  assert starts_with_ew8("ew899") is True
  assert starts_with_ew8("EW012") is False

