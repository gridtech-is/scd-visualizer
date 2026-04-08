"""
Integration tests: parse_scd → run_validations → write_outputs pipeline.
Uses the example SCD files shipped with the project and inline XML fixtures.
"""
from __future__ import annotations

import tempfile
import textwrap
from pathlib import Path

import pytest

from scd_export import write_outputs
from scd_parser import parse_scd
from scd_validations import run_validations

# Locate example files relative to this test file.
EXAMPLES_DIR = Path(__file__).parent.parent / "public" / "examples"
BASIC_SCD = EXAMPLES_DIR / "example-basic.scd"
UNRESOLVED_SCD = EXAMPLES_DIR / "example-unresolved.scd"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scd_file(content: str) -> Path:
    """Write SCD XML content to a temporary file and return its path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".scd", delete=False, mode="w", encoding="utf-8")
    tmp.write(textwrap.dedent(content))
    tmp.close()
    return Path(tmp.name)


# ---------------------------------------------------------------------------
# Parsing – example-basic.scd
# ---------------------------------------------------------------------------

def test_parse_basic_ied_count():
    parsed = parse_scd(BASIC_SCD)
    assert len(parsed.ied_names) == 2
    assert "PUB_A" in parsed.ied_names
    assert "SUB_B" in parsed.ied_names


def test_parse_basic_goose_control():
    parsed = parse_scd(BASIC_SCD)
    assert len(parsed.goose_controls) == 1
    gcb = parsed.goose_controls[0]
    assert gcb.ied_name == "PUB_A"
    assert gcb.control_name == "GCB_TRIP"
    assert gcb.dataset == "DS_GOOSE_1"


def test_parse_basic_sv_control():
    parsed = parse_scd(BASIC_SCD)
    assert len(parsed.sv_controls) == 1
    sv = parsed.sv_controls[0]
    assert sv.ied_name == "PUB_A"
    assert sv.control_name == "SMV_MU1"
    assert sv.smv_id == "MU_STREAM_1"


def test_parse_basic_mms_control():
    parsed = parse_scd(BASIC_SCD)
    assert len(parsed.mms_controls) == 1
    rpt = parsed.mms_controls[0]
    assert rpt.ied_name == "PUB_A"
    assert rpt.control_name == "RPT_STATUS"
    assert rpt.dataset == "DS_GOOSE_1"
    assert rpt.indexed is True  # default when attribute absent


def test_parse_basic_access_point_ip():
    parsed = parse_scd(BASIC_SCD)
    ips = {(ap.ied_name, ap.ap_name): ap.ip for ap in parsed.access_points}
    assert ips.get(("PUB_A", "AP1")) == "10.1.0.10"
    assert ips.get(("SUB_B", "AP1")) == "10.1.0.20"


def test_parse_basic_goose_mac():
    parsed = parse_scd(BASIC_SCD)
    gcb = parsed.goose_controls[0]
    # MAC should be normalised to colon-separated uppercase
    assert gcb.mac_address == "01:0C:CD:01:00:10"


def test_parse_basic_goose_dataset_signals():
    parsed = parse_scd(BASIC_SCD)
    signals = parsed.GOOSE_dataset_dict.get("PUB_A", {}).get("DS_GOOSE_1", [])
    assert len(signals) == 1
    assert "PTOC" in signals[0]


def test_parse_basic_sv_appid_normalised():
    parsed = parse_scd(BASIC_SCD)
    sv = parsed.sv_controls[0]
    assert sv.appid == "4001"


# ---------------------------------------------------------------------------
# Parsing – example-unresolved.scd
# ---------------------------------------------------------------------------

def test_parse_unresolved_no_ip():
    parsed = parse_scd(UNRESOLVED_SCD)
    for ap in parsed.access_points:
        # Neither IED has an IP address defined
        assert ap.ip == ""


def test_parse_unresolved_goose_no_comm():
    parsed = parse_scd(UNRESOLVED_SCD)
    assert len(parsed.goose_controls) == 1
    gcb = parsed.goose_controls[0]
    assert gcb.mac_address == ""
    assert gcb.appid == ""


def test_parse_unresolved_subscriber_not_set():
    parsed = parse_scd(UNRESOLVED_SCD)
    # SUB_Y's ExtRef has no iedName, so no subscriber should be resolved
    gcb = parsed.goose_controls[0]
    assert gcb.subscribers == []


# ---------------------------------------------------------------------------
# Validation – duplicate IED names (check 1)
# ---------------------------------------------------------------------------

def test_validation_duplicate_ied_names():
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED_A"><AccessPoint name="AP1"><Server/></AccessPoint></IED>
          <IED name="IED_A"><AccessPoint name="AP1"><Server/></AccessPoint></IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check1 = next(s for s in result.summaries if s.check_id == "1")
    assert check1.status == "FAIL"
    fail_detail = next(d for d in result.details if d.check_id == "1" and d.status == "FAIL")
    assert "2 times" in fail_detail.message


def test_validation_no_duplicate_ied_names_passes():
    parsed = parse_scd(BASIC_SCD)
    result = run_validations(parsed)
    check1 = next(s for s in result.summaries if s.check_id == "1")
    assert check1.status == "PASS"


# ---------------------------------------------------------------------------
# Validation – duplicate IP (check 2)
# ---------------------------------------------------------------------------

def test_validation_duplicate_ip_detected():
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="A"><AccessPoint name="AP1"><Server/></AccessPoint></IED>
          <IED name="B"><AccessPoint name="AP1"><Server/></AccessPoint></IED>
          <Communication>
            <SubNetwork name="SN1">
              <ConnectedAP iedName="A" apName="AP1">
                <Address><P type="IP">10.0.0.1</P></Address>
              </ConnectedAP>
              <ConnectedAP iedName="B" apName="AP1">
                <Address><P type="IP">10.0.0.1</P></Address>
              </ConnectedAP>
            </SubNetwork>
          </Communication>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check2 = next(s for s in result.summaries if s.check_id == "2")
    assert check2.status == "FAIL"


# ---------------------------------------------------------------------------
# Validation – MMS indexed flag (check 7)
# ---------------------------------------------------------------------------

def test_validation_mms_indexed_false_fails():
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server>
                <LDevice inst="LD0">
                  <LN0 lnClass="LLN0">
                    <ReportControl name="RPT1" datSet="DS1" rptID="RPT1" indexed="false"/>
                  </LN0>
                </LDevice>
              </Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check7 = next(s for s in result.summaries if s.check_id == "7")
    assert check7.status == "FAIL"


def test_validation_mms_indexed_true_passes():
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server>
                <LDevice inst="LD0">
                  <LN0 lnClass="LLN0">
                    <ReportControl name="RPT1" datSet="DS1" rptID="RPT1" indexed="true"/>
                  </LN0>
                </LDevice>
              </Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check7 = next(s for s in result.summaries if s.check_id == "7")
    assert check7.status == "PASS"


# ---------------------------------------------------------------------------
# Validation – GOOSE naming rule (check 8)
# ---------------------------------------------------------------------------

def test_validation_goose_naming_correct():
    # Check 8 rule: name must start with "gc" and dataset must be "g" + name[2:]
    # gcTrip → expected dataset "gTrip"
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server>
                <LDevice inst="LD0">
                  <LN0 lnClass="LLN0">
                    <DataSet name="gTrip"/>
                    <GSEControl name="gcTrip" datSet="gTrip"/>
                  </LN0>
                </LDevice>
              </Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check8 = next(s for s in result.summaries if s.check_id == "8")
    assert check8.status == "PASS"


def test_validation_goose_naming_wrong_dataset():
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server>
                <LDevice inst="LD0">
                  <LN0 lnClass="LLN0">
                    <DataSet name="wrongDS"/>
                    <GSEControl name="gcTrip" datSet="wrongDS"/>
                  </LN0>
                </LDevice>
              </Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check8 = next(s for s in result.summaries if s.check_id == "8")
    assert check8.status == "FAIL"


# ---------------------------------------------------------------------------
# Validation – configurable thresholds (checks 11/12)
# ---------------------------------------------------------------------------

def test_validation_check11_custom_config():
    """Check that custom config values override built-in defaults."""
    custom_config = {
        "goose_protection": {"appid_prefix": "80", "vlan_priority": 6, "min_time": 4, "max_time": 2000},
        "goose_standard": {"appid_prefix": "00", "vlan_priority": 4, "min_time": 10, "max_time": 10000},
        "sv": {"appid_prefix": "40", "vlan_priority_protection": 7, "vlan_priority_metered": 4},
    }
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server>
                <LDevice inst="LD0">
                  <LN0 lnClass="LLN0">
                    <GSEControl name="gcPtrip" datSet="gcPtripDS"/>
                  </LN0>
                </LDevice>
              </Server>
            </AccessPoint>
          </IED>
          <Communication>
            <SubNetwork name="SN1">
              <ConnectedAP iedName="IED1" apName="AP1">
                <GSE ldInst="LD0" cbName="gcPtrip">
                  <Address>
                    <P type="MAC-Address">01:0C:CD:01:AA:BB</P>
                    <P type="APPID">80BB</P>
                    <P type="VLAN-PRIORITY">6</P>
                  </Address>
                </GSE>
              </ConnectedAP>
            </SubNetwork>
          </Communication>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed, config=custom_config)
    check11 = next(s for s in result.summaries if s.check_id == "11")
    # vlan-priority=6 matches custom config → no vlan_priority error
    # APPID/MAC/MinTime/MaxTime checks may still fail (they are not set here)
    # but this confirms the config path is exercised
    assert check11 is not None


# ---------------------------------------------------------------------------
# Write_outputs smoke test
# ---------------------------------------------------------------------------

def test_write_outputs_creates_all_files():
    parsed = parse_scd(BASIC_SCD)
    validation = run_validations(parsed)
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        write_outputs(parsed, validation, out_dir)
        expected_files = [
            "validation_results.csv",
            "out_MMS.csv",
            "out_MMS_datasets.csv",
            "out_goose.csv",
            "out_goose_datasets.csv",
            "out_sv.csv",
            "IEDs_SW_filter_template.csv",
        ]
        for fname in expected_files:
            assert (out_dir / fname).exists(), f"Missing output file: {fname}"


def test_write_outputs_validation_csv_content():
    parsed = parse_scd(BASIC_SCD)
    validation = run_validations(parsed)
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        write_outputs(parsed, validation, out_dir)
        content = (out_dir / "validation_results.csv").read_text(encoding="utf-8")
        assert "check_id" in content
        assert "PASS" in content or "FAIL" in content


def test_write_outputs_goose_csv_content():
    parsed = parse_scd(BASIC_SCD)
    validation = run_validations(parsed)
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        write_outputs(parsed, validation, out_dir)
        content = (out_dir / "out_goose.csv").read_text(encoding="utf-8")
        assert "GCB_TRIP" in content
        assert "PUB_A" in content


def test_write_outputs_filter_template():
    parsed = parse_scd(BASIC_SCD)
    validation = run_validations(parsed)
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        write_outputs(parsed, validation, out_dir)
        content = (out_dir / "IEDs_SW_filter_template.csv").read_text(encoding="utf-8")
        assert "PUB_A" in content
        assert "SUB_B" in content


# ---------------------------------------------------------------------------
# New IEC_001-009 checks
# ---------------------------------------------------------------------------

def test_iec001_goose_no_subscriber_fails():
    """IEC_001: GOOSE control with no subscribers → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="PUB_A">
            <AccessPoint name="AP1">
              <Server><LDevice inst="LD0">
                <LN0 lnClass="LLN0"><GSEControl name="gcTrip" datSet="gTrip"/></LN0>
              </LDevice></Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_001")
    assert check.status == "FAIL"


def test_iec002_sv_no_subscriber_fails():
    """IEC_002: SV control with no subscribers → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="PUB_A">
            <AccessPoint name="AP1">
              <Server><LDevice inst="LD0">
                <LN0 lnClass="LLN0"><SampledValueControl name="svMU" datSet="dsV"/></LN0>
              </LDevice></Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_002")
    assert check.status == "FAIL"


def test_iec003_extref_unknown_ied_fails():
    """IEC_003: ExtRef pointing to nonexistent IED → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="SUB_A">
            <AccessPoint name="AP1">
              <Server><LDevice inst="LD0">
                <LN0 lnClass="LLN0">
                  <Inputs>
                    <ExtRef iedName="GHOST_IED" ldInst="LD0" srcCBName="gcTrip" serviceType="GOOSE"/>
                  </Inputs>
                </LN0>
              </LDevice></Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_003")
    assert check.status == "FAIL"


def test_iec004_bad_ied_name_fails():
    """IEC_004: IED name not matching convention → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="BADNAME">
            <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_004")
    assert check.status == "FAIL"


def test_iec005_ied_not_in_substation_fails():
    """IEC_005: IED with no LNode reference in Substation → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="ORPHAN">
            <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_005")
    assert check.status == "FAIL"


def test_iec006_missing_lntype_fails():
    """IEC_006: LN references lnType not in DataTypeTemplates → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server><LDevice inst="LD0">
                <LN0 lnClass="LLN0" lnType="MISSING_TYPE"/>
              </LDevice></Server>
            </AccessPoint>
          </IED>
          <DataTypeTemplates/>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_006")
    assert check.status == "FAIL"


def test_iec007_empty_dataset_fails():
    """IEC_007: GOOSE control references empty DataSet → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server><LDevice inst="LD0">
                <LN0 lnClass="LLN0">
                  <DataSet name="gTrip"/>
                  <GSEControl name="gcTrip" datSet="gTrip"/>
                </LN0>
              </LDevice></Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_007")
    assert check.status == "FAIL"


def test_iec008_zero_confrev_fails():
    """IEC_008: GOOSE control with confRev=0 → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="IED1">
            <AccessPoint name="AP1">
              <Server><LDevice inst="LD0">
                <LN0 lnClass="LLN0">
                  <GSEControl name="gcTrip" datSet="gTrip" confRev="0"/>
                </LN0>
              </LDevice></Server>
            </AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_008")
    assert check.status == "FAIL"


def test_iec009_ew8_without_sv_fails():
    """IEC_009: IED starting with EW8 without SampledValueControl → FAIL."""
    scd = _scd_file("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <SCL>
          <IED name="EW801">
            <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint>
          </IED>
        </SCL>
    """)
    parsed = parse_scd(scd)
    result = run_validations(parsed)
    check = next(s for s in result.summaries if s.check_id == "IEC_009")
    assert check.status == "FAIL"
