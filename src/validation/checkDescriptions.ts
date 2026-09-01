export interface CheckDescription {
  summary: string;
  detail: string;
  example?: string;
}

export const CHECK_DESCRIPTIONS: Record<string, CheckDescription> = {
  SCL_XSD: {
    summary: 'XML Schema validation (IEC 61850-6 SCL)',
    detail:
      'Validates that the XML structure of the file conforms to the official IEC 61850-6 SCL schema (XSD). This catches syntax errors, missing attributes, invalid value ranges, and other structural deviations not permitted by the standard.',
    example: 'E.g. if the <SCL> root element is missing a required attribute, or an element appears in the wrong order.',
  },

  IEC_009: {
    summary: 'No duplicate IED names',
    detail:
      'Each IED in the file must have a unique name. If two or more IEDs share the same name, the system cannot distinguish between them and communication becomes ambiguous.',
    example: 'E.g. if two IEDs are both named NJA_D_SP1_EW811.',
  },
  IEC_010: {
    summary: 'Subnet IPs unique, valid and on one network',
    detail:
      'Within each SubNetwork every Access Point must have a unique IP address, the address must be a real station-network address (loopback 127.x.x.x and 0.0.0.0 are placeholders), and all addresses must share one network — e.g. all on 192.168.100.X, never mixed with 192.168.101.X.',
    example: 'E.g. if two IEDs both have IP address 192.168.1.10 on the same SubNetwork.',
  },
  LNET_003: {
    summary: 'Consistent 3rd octet of IP address per substation/subnetwork',
    detail:
      'Within the same substation or subnetwork, all IP addresses must share the same 3rd octet (except the 10.30.200.* exception). This ensures devices are on the same IP segment and can communicate.',
    example: 'E.g. if some IEDs at substation NJA have 192.168.1.x while others have 192.168.2.x.',
  },
  LNET_004: {
    summary: '192.168.* — subnet mask 255.255.255.0 and gateway 0.0.0.0',
    detail:
      'All Access Points with a 192.168.* IP address must use netmask 255.255.255.0 and gateway 0.0.0.0. This is the Landsnet standard configuration for internal networks.',
    example: 'E.g. if a ConnectedAP with IP 192.168.1.5 uses gateway 192.168.1.1 instead of 0.0.0.0.',
  },
  LNET_005: {
    summary: '10.30.* — subnet mask 255.255.255.0 and gateway 0.0.0.0',
    detail:
      'All Access Points with a 10.30.* IP address must use netmask 255.255.255.0 and gateway 0.0.0.0. Landsnet standard configuration for SCADA/process networks.',
    example: 'E.g. if a ConnectedAP with IP 10.30.1.5 has an incorrect subnet mask.',
  },
  LNET_006: {
    summary: '172.25.* — subnet mask 255.255.255.0 and gateway *.254',
    detail:
      'All Access Points with a 172.25.* IP address must use netmask 255.255.255.0 and a gateway ending in .254. This applies to WAN/routed connections.',
    example: 'E.g. if IP is 172.25.10.5 then gateway must be 172.25.10.254.',
  },
  LNET_007: {
    summary: 'All MMS reports have indexed=true',
    detail:
      'All ReportControl elements in the MMS service must have indexed="true". This allows multiple simultaneous report connections (buffered/unbuffered) to the same report.',
    example: 'E.g. if <ReportControl name="rcb01" indexed="false"> is defined.',
  },
  LNET_008: {
    summary: 'GOOSE naming convention for control block and dataset',
    detail:
      'GOOSE control block names and dataset names must follow the Landsnet naming convention. This ensures consistent and recognisable identifiers throughout the system.',
    example: 'E.g. if a GSEControl has a name that does not start with gc or does not follow the required pattern.',
  },
  IEC_011: {
    summary: 'No duplicate GOOSE MAC addresses or APPIDs',
    detail:
      'Each GOOSE control block must have a unique MAC address and APPID at the Ethernet layer. Duplicate values prevent IEDs from determining the source of a GOOSE packet.',
    example: 'E.g. if two GOOSE control blocks both have APPID 0x1001 or MAC 01:0C:CD:01:00:01.',
  },
  LNET_010: {
    summary: 'GOOSE MAC station byte matches 3rd octet of IP address',
    detail:
      'Per Landsnet standard, the station byte of the GOOSE MAC address (5th byte) must match the 3rd octet of the Access Point IP address. This ties MAC and IP identifiers to the same substation.',
    example: 'E.g. if IP is 192.168.10.x then the GOOSE MAC 5th byte must be 0x0A (10).',
  },
  LNET_011: {
    summary: 'GOOSE P-profile APPID/VLAN/MinTime/MaxTime rule',
    detail:
      'GOOSE control blocks using P-profile (protection) must comply with Landsnet APPID range, VLAN value, minimum time (MinTime) and maximum time (MaxTime) rules for protection messaging.',
    example: 'E.g. if a P-profile GOOSE has MaxTime > 1000 ms or an APPID outside the permitted range.',
  },
  LNET_012: {
    summary: 'GOOSE non-P-profile APPID/VLAN/MinTime/MaxTime rule',
    detail:
      'GOOSE control blocks that are NOT P-profile (e.g. metering, monitoring) must meet different Landsnet values for APPID range, VLAN, and timing parameters.',
    example: 'E.g. if a non-P GOOSE uses an APPID range reserved for P-profile.',
  },
  LNET_013: {
    summary: 'IED EW0** contains gcPtrp*, gcPev*, gcInd* datasets',
    detail:
      'IEDs whose name contains EW0** (protection and metering devices) must contain the specified GOOSE datasets: gcPtrp* (trip signals), gcPev* (power events), gcInd* (indications). This is the Landsnet minimum GOOSE output requirement.',
    example: 'E.g. if NJA_D_SP1_EW021 has no gcPtrp* dataset.',
  },
  LNET_014: {
    summary: 'IED EW8** contains gcPtrp*, gcInd* datasets',
    detail:
      'IEDs whose name contains EW8** (merging unit / sampler) must contain gcPtrp* and gcInd* GOOSE datasets. This ensures the MU can send protection signals and status indications.',
    example: 'E.g. if NJA_E_SP1_EW811 is missing the gcInd* dataset.',
  },
  IEC_012: {
    summary: 'No duplicate SV smvID, MAC or APPID',
    detail:
      'Each Sampled Values (SV) control block must have a unique smvID, MAC address and APPID. Duplicate values cause confusion in SV reception at IEDs.',
    example: 'E.g. if two SampledValueControl blocks share the same smvID or APPID 0x4001.',
  },
  LNET_016: {
    summary: 'All SV APPIDs start with 4',
    detail:
      'Per Landsnet standard, the APPID on Sampled Values (SV) control blocks must always start with the digit 4 (hex 0x4xxx). This separates the SV APPID range from GOOSE (0x0xxx–0x3xxx).',
    example: 'E.g. if an SV APPID is 0x1001 instead of 0x4001.',
  },
  LNET_017: {
    summary: 'SV MAC station byte matches 3rd octet of IP address',
    detail:
      'As with GOOSE (LNET_010), the 5th byte of the SV MAC address must match the 3rd octet of the Access Point IP address. This ties SV streams to the correct substation.',
    example: 'E.g. if IP is 192.168.15.x then the SV MAC 5th byte must be 0x0F (15).',
  },
  LNET_018: {
    summary: 'SV APPID/VLAN priority rule',
    detail:
      'Sampled Values control blocks must comply with Landsnet APPID range and VLAN priority settings. SV data receives special priority handling in network equipment.',
    example: 'E.g. if SV VLAN priority is not 4 or APPID is outside the 0x4000–0x7FFF range.',
  },

  IEC_001: {
    summary: 'GOOSE subscription fulfilment',
    detail:
      'Checks that all GOOSE subscriptions (ExtRef with serviceType=GOOSE) have a corresponding publisher. Every IED that subscribes to a GOOSE must receive it from an IED that is defined in the file and publishes that GOOSE.',
    example: 'E.g. if IED A subscribes to a GOOSE from IED B but IED B is not defined in the file.',
  },
  IEC_002: {
    summary: 'SV subscription fulfilment',
    detail:
      'Same as IEC_001 but for Sampled Values (SV). All SV subscriptions must have a corresponding SampledValueControl publisher in the file.',
    example: 'E.g. if a merging unit is not present in the file but an IED is subscribing to SV from it.',
  },
  IEC_003: {
    summary: 'ExtRef fully resolved',
    detail:
      'All <ExtRef> elements with an iedName attribute must point to an IED and control block that exist in the file. ' +
      'The check respects the serviceType attribute: "GOOSE" → GSEControl, "SMV" → SampledValueControl, "Report" → ReportControl. ' +
      'Report subscriptions (HMI/Gateway clients) are correctly validated against ReportControl elements and do not produce false positives.',
    example: 'E.g. if an ExtRef with serviceType="GOOSE" references srcCBName="gcPtrp1" but that GSEControl is not found on the publisher IED.',
  },
  IEC_004: {
    summary: 'IED naming convention',
    detail:
      'IED names must follow the KKS convention: [STATION]_[VOLTAGE]_[BAY]_[DEV][NNN] for bay devices (e.g. MJO_F_TT2_EW050), [STATION]_[VOLTAGE]_[DEV][NNN] for station-level devices such as busbar protection (e.g. MJO_E_EW991), or [STATION]_GW / [STATION]_HMI for gateways and HMIs. The device code may be any two letters (EW, EU, …).',
    example: 'E.g. NJA_D_SP1_EW811, MJO_E_EW991 and MJO_GW are valid, but Relay01 or NJA-IED-001 are not.',
  },
  IEC_005: {
    summary: 'IED is in the substation hierarchy',
    detail:
      'Each IED must be referenced by an <LNode> element somewhere in the <Substation> section. IEDs not linked to the hierarchy are unorganised and harder to trace.',
    example: 'E.g. if an IED is defined in the <IED> section but no <LNode iedName="..."> points to it.',
  },
  IEC_006: {
    summary: 'DataTypeTemplates completeness',
    detail:
      'Validates referential integrity and completeness of the <DataTypeTemplates> section. ' +
      'Checks: (1) all lnType references in LN elements resolve to a known LNodeType; ' +
      '(2) all DO type references in LNodeType resolve to a known DOType; ' +
      '(3) DOType elements have at least one DA child; ' +
      '(4) EnumType elements referenced by a DA have at least one EnumVal entry; ' +
      '(5) all type ids (LNodeType, DOType, DAType, EnumType) are unique.',
    example: 'E.g. if an LN references lnType="XCBR_Type1" but that type is not in DataTypeTemplates, or a DOType has no DA children.',
  },
  IEC_007: {
    summary: 'GOOSE/SV dataset is not empty',
    detail:
      'All DataSet elements referenced by GOOSE or SV control blocks must contain at least one FCDA. Empty datasets are invalid and transmit no useful information.',
    example: 'E.g. if <DataSet name="dsGOOSE1"> is empty with no <FCDA> elements.',
  },
  IEC_008: {
    summary: 'confRev consistency',
    detail:
      'The configuration revision (confRev) on GOOSE and SV control blocks must be consistent. Mismatched confRev values between publisher and subscriber can cause IEDs to reject packets.',
    example: 'E.g. if a GSEControl has confRev="1" but the subscriber IED expects confRev="2".',
  },
  IEC_013: {
    summary: 'Report client binding',
    detail:
      'A client IED (an AccessPoint with client LNs such as IHMI/ITCI but no Server) should be referenced by at least one ReportControl ClientLN. An unbound client means report bindings are not engineered in the SCD. Dynamic MMS reporting is legal, so this is a warning, not an error.',
    example: 'E.g. an OPC server IED exists in the file, all ReportControls have <RptEnabled max="5"/> but no <ClientLN> pointing to it.',
  },
  IEC_014: {
    summary: 'GOOSE/SV supervision LNs (LGOS/LSVS)',
    detail:
      'Each IED should model one LGOS logical node per GOOSE subscription and one LSVS logical node per subscribed SV stream, so that subscription health can be supervised and alarmed on the HMI (Landsnet implementation guideline §2.2 and requirements §4.5).',
    example: 'E.g. an IED subscribes to 4 GOOSE control blocks but its data model contains only 2 LGOS instances.',
  },
  IEC_015: {
    summary: 'SV sample rate per IEC 61869-9',
    detail:
      'SampledValueControl smpRate must be one of the IEC 61869-9 rates: 4800 (preferred for protection and measurement), 14400 (quality metering), or 4000 (9-2LE backward compatibility). 12800 is deprecated.',
    example: 'E.g. a control block with smpRate="9600", or the deprecated smpRate="12800".',
  },
  LNET_019: {
    summary: 'MMS report naming convention (r + dataset)',
    detail:
      'MMS report control blocks must be named after their dataset with an "r" prefix — rEv for dataset Ev, rProt for Prot, rMeas for Meas (Landsnet implementation guideline §3.8.1).',
    example: 'E.g. a ReportControl named "urcbA" on dataset "Ev" should be renamed "rEv".',
  },
  LNET_020: {
    summary: 'Substation section KKS naming',
    detail:
      'Substation-section names must follow the KKS convention already used in the IED names: the Substation name is the station code (e.g. MJO), each VoltageLevel name is the voltage-class letter only (e.g. E for 132 kV), and each Bay name is the KKS bay code (MJ1, SP1…), its full form (MJ1_2AEL10), or a bare busbar code (0AEA10). Every bay must carry the full KKS identifier in its name or desc.',
    example: 'E.g. Substation name="AA1", VoltageLevel name="E1" or Bay name="Q01" instead of MJO / E / MJ1.',
  },
  IEC_016: {
    summary: 'ConductingEquipment has LNode binding',
    detail:
      'Every ConductingEquipment in the Substation section (CBR, DIS, …) must contain at least one LNode reference binding it to the IED that controls or supervises it (CSWI, CILO, XCBR/XSWI…). Unbound equipment breaks traceability between the single-line diagram and the automation system.',
    example: 'E.g. <ConductingEquipment name="GS210" type="DIS"/> with no <LNode> children.',
  },
};
