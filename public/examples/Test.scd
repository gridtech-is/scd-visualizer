<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.iec.ch/61850/2003/SCL SCL.xsd"
     version="2007" revision="B" release="4">

  <Header id="TEST_SUBSTATION" version="V1" revision="R000"
          toolID="SCD Visualizer Test" nameStructure="IEDName">
    <History>
      <Hitem version="V1" revision="R000"
             when="Mon Jan 01 10:00:00 CET 2024"
             who="Test Engineer"
             what="Initial test configuration"
             why="Wiki demonstration file"/>
    </History>
  </Header>

  <Communication>
    <SubNetwork name="MMS_LAN" type="8-MMS" desc="MMS Station Bus">
      <BitRate unit="b/s" multiplier="M">100</BitRate>
      <ConnectedAP iedName="TST_A_BB1_EW001" apName="S1">
        <Address>
          <P type="IP">10.0.1.1</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">00-01-01-00-01-01</P>
        </Address>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_BB1_EW002" apName="S1">
        <Address>
          <P type="IP">10.0.1.2</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">00-01-01-00-01-02</P>
        </Address>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_FDR_EW010" apName="S1">
        <Address>
          <P type="IP">10.0.1.10</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">00-01-01-00-01-10</P>
        </Address>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_FDR_EW011" apName="S1">
        <Address>
          <P type="IP">10.0.1.11</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">00-01-01-00-01-11</P>
        </Address>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_TRF_EW020" apName="S1">
        <Address>
          <P type="IP">10.0.1.20</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">00-01-01-00-01-20</P>
        </Address>
      </ConnectedAP>
      <ConnectedAP iedName="TST_B_BB1_EW810" apName="S1">
        <Address>
          <P type="IP">10.0.1.30</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">00-01-01-00-01-30</P>
        </Address>
      </ConnectedAP>
    </SubNetwork>

    <SubNetwork name="GOOSE_LAN" type="8-MMS" desc="GOOSE Process Bus">
      <BitRate unit="b/s" multiplier="M">100</BitRate>
      <ConnectedAP iedName="TST_A_BB1_EW001" apName="G1">
        <Address>
          <P type="IP">192.168.1.1</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">01-0C-CD-01-00-01</P>
        </Address>
        <GSE ldInst="PROT" cbName="GoCB_Trip">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-01</P>
            <P type="APPID">0x1001</P>
            <P type="VLAN-ID">0x001</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
          <MinTime unit="s" multiplier="m">4</MinTime>
          <MaxTime unit="s" multiplier="m">1000</MaxTime>
        </GSE>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_FDR_EW010" apName="G1">
        <Address>
          <P type="IP">192.168.1.10</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">01-0C-CD-01-00-10</P>
        </Address>
        <GSE ldInst="PROT" cbName="GoCB_Trip">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-10</P>
            <P type="APPID">0x1010</P>
            <P type="VLAN-ID">0x001</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
          <MinTime unit="s" multiplier="m">4</MinTime>
          <MaxTime unit="s" multiplier="m">1000</MaxTime>
        </GSE>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_FDR_EW011" apName="G1">
        <Address>
          <P type="IP">192.168.1.11</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">01-0C-CD-01-00-11</P>
        </Address>
        <GSE ldInst="PROT" cbName="GoCB_Trip">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-11</P>
            <P type="APPID">0x1011</P>
            <P type="VLAN-ID">0x001</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
          <MinTime unit="s" multiplier="m">4</MinTime>
          <MaxTime unit="s" multiplier="m">1000</MaxTime>
        </GSE>
      </ConnectedAP>
      <ConnectedAP iedName="TST_A_TRF_EW020" apName="G1">
        <Address>
          <P type="IP">192.168.1.20</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">01-0C-CD-01-00-20</P>
        </Address>
        <GSE ldInst="PROT" cbName="GoCB_Trip">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-20</P>
            <P type="APPID">0x1020</P>
            <P type="VLAN-ID">0x001</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
          <MinTime unit="s" multiplier="m">4</MinTime>
          <MaxTime unit="s" multiplier="m">1000</MaxTime>
        </GSE>
        <SMV ldInst="MEAS" cbName="SvCB_Meas">
          <Address>
            <P type="MAC-Address">01-0C-CD-04-00-20</P>
            <P type="APPID">0x4020</P>
            <P type="VLAN-ID">0x002</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
        </SMV>
      </ConnectedAP>
      <ConnectedAP iedName="TST_B_BB1_EW810" apName="G1">
        <Address>
          <P type="IP">192.168.1.30</P>
          <P type="IP-SUBNET">255.255.255.0</P>
          <P type="IP-GATEWAY">0.0.0.0</P>
          <P type="MAC-Address">01-0C-CD-01-00-30</P>
        </Address>
        <SMV ldInst="MEAS" cbName="SvCB_Meas">
          <Address>
            <P type="MAC-Address">01-0C-CD-04-00-30</P>
            <P type="APPID">0x4030</P>
            <P type="VLAN-ID">0x002</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
        </SMV>
      </ConnectedAP>
    </SubNetwork>
  </Communication>

  <!-- IED 1: Busbar protection A -->
  <IED name="TST_A_BB1_EW001" desc="Busbar Protection A" type="REB500" manufacturer="ABB" configVersion="1.0">
    <AccessPoint name="S1">
      <Server>
        <Authentication none="true"/>
        <LDevice inst="PROT" desc="Protection">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_GOOSE_Trip" desc="Trip dataset">
              <FCDA ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="general" fc="ST"/>
            </DataSet>
            <GSEControl name="GoCB_Trip" type="GOOSE" datSet="DS_GOOSE_Trip" confRev="1" appID="TST_A_BB1_EW001/PROT/LLN0.GoCB_Trip" desc="GOOSE trip">
              <IEDName>TST_A_FDR_EW010</IEDName>
              <IEDName>TST_A_FDR_EW011</IEDName>
            </GSEControl>
            <ReportControl name="RCB_Status" datSet="DS_Status" confRev="1" desc="Status report" buffered="true" intgPd="5000" indexed="true">
              <TrgOps dchg="true" qchg="true" dupd="false" period="true"/>
              <OptFields seqNum="true" timeStamp="true" dataSet="true" reasonCode="true"/>
              <RptEnabled max="5"/>
            </ReportControl>
            <DataSet name="DS_Status" desc="Status dataset">
              <FCDA ldInst="PROT" lnClass="CSWI" lnInst="1" doName="Pos" daName="stVal" fc="ST"/>
            </DataSet>
          </LN0>
          <LN lnClass="PTRC" inst="1" lnType="PTRC_Type" desc="Trip conditioning">
            <ExtRef intAddr="Trip" desc="Trip from feeder 1"
                    iedName="TST_A_FDR_EW010" ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="general" serviceType="GOOSE"/>
            <ExtRef intAddr="Trip2" desc="Trip from feeder 2"
                    iedName="TST_A_FDR_EW011" ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="general" serviceType="GOOSE"/>
          </LN>
          <LN lnClass="CSWI" inst="1" lnType="CSWI_Type" desc="Switch controller"/>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>

  <!-- IED 2: Busbar protection B (merging unit) -->
  <IED name="TST_A_BB1_EW002" desc="Busbar Merging Unit A" type="MU320" manufacturer="GE" configVersion="1.0">
    <AccessPoint name="S1">
      <Server>
        <Authentication none="true"/>
        <LDevice inst="MEAS" desc="Measurements">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_SV_Meas" desc="Sampled values dataset">
              <FCDA ldInst="MEAS" lnClass="TVTR" lnInst="1" doName="Vol" daName="instMag" fc="MX"/>
              <FCDA ldInst="MEAS" lnClass="TCTR" lnInst="1" doName="Amp" daName="instMag" fc="MX"/>
            </DataSet>
          </LN0>
          <LN lnClass="TVTR" inst="1" lnType="TVTR_Type" desc="Voltage transformer"/>
          <LN lnClass="TCTR" inst="1" lnType="TCTR_Type" desc="Current transformer"/>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>

  <!-- IED 3: Feeder protection 1 -->
  <IED name="TST_A_FDR_EW010" desc="Feeder Protection 1" type="REF615" manufacturer="ABB" configVersion="1.0">
    <AccessPoint name="S1">
      <Server>
        <Authentication none="true"/>
        <LDevice inst="PROT" desc="Protection">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_GOOSE_Trip" desc="GOOSE trip dataset">
              <FCDA ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="general" fc="ST"/>
              <FCDA ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="q" fc="ST"/>
            </DataSet>
            <GSEControl name="GoCB_Trip" type="GOOSE" datSet="DS_GOOSE_Trip" confRev="1" appID="TST_A_FDR_EW010/PROT/LLN0.GoCB_Trip" desc="GOOSE trip">
              <IEDName>TST_A_BB1_EW001</IEDName>
            </GSEControl>
          </LN0>
          <LN lnClass="PTRC" inst="1" lnType="PTRC_Type" desc="Trip conditioning">
            <ExtRef intAddr="SV_I" desc="Current from merging unit"
                    iedName="TST_A_TRF_EW020" ldInst="MEAS" lnClass="TCTR" lnInst="1" doName="Amp" daName="instMag" serviceType="SMV"/>
          </LN>
          <LN lnClass="PIOC" inst="1" lnType="PIOC_Type" desc="Instantaneous overcurrent"/>
        </LDevice>
      </Server>
    </AccessPoint>
    <AccessPoint name="G1"/>
  </IED>

  <!-- IED 4: Feeder protection 2 -->
  <IED name="TST_A_FDR_EW011" desc="Feeder Protection 2" type="REF615" manufacturer="ABB" configVersion="1.0">
    <AccessPoint name="S1">
      <Server>
        <Authentication none="true"/>
        <LDevice inst="PROT" desc="Protection">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_GOOSE_Trip" desc="GOOSE trip dataset">
              <FCDA ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="general" fc="ST"/>
              <FCDA ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="q" fc="ST"/>
            </DataSet>
            <GSEControl name="GoCB_Trip" type="GOOSE" datSet="DS_GOOSE_Trip" confRev="1" appID="TST_A_FDR_EW011/PROT/LLN0.GoCB_Trip" desc="GOOSE trip">
              <IEDName>TST_A_BB1_EW001</IEDName>
            </GSEControl>
          </LN0>
          <LN lnClass="PTRC" inst="1" lnType="PTRC_Type" desc="Trip conditioning">
            <ExtRef intAddr="SV_I" desc="Current from merging unit"
                    iedName="TST_A_TRF_EW020" ldInst="MEAS" lnClass="TCTR" lnInst="1" doName="Amp" daName="instMag" serviceType="SMV"/>
          </LN>
          <LN lnClass="PIOC" inst="1" lnType="PIOC_Type" desc="Instantaneous overcurrent"/>
        </LDevice>
      </Server>
    </AccessPoint>
    <AccessPoint name="G1"/>
  </IED>

  <!-- IED 5: Transformer protection + merging unit -->
  <IED name="TST_A_TRF_EW020" desc="Transformer Protection" type="RET670" manufacturer="ABB" configVersion="1.0">
    <AccessPoint name="S1">
      <Server>
        <Authentication none="true"/>
        <LDevice inst="PROT" desc="Protection">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_GOOSE_Trip" desc="GOOSE trip dataset">
              <FCDA ldInst="PROT" lnClass="PTRC" lnInst="1" doName="Tr" daName="general" fc="ST"/>
            </DataSet>
            <GSEControl name="GoCB_Trip" type="GOOSE" datSet="DS_GOOSE_Trip" confRev="1" appID="TST_A_TRF_EW020/PROT/LLN0.GoCB_Trip" desc="GOOSE trip">
              <IEDName>TST_A_BB1_EW001</IEDName>
            </GSEControl>
          </LN0>
          <LN lnClass="PTRC" inst="1" lnType="PTRC_Type" desc="Trip conditioning"/>
          <LN lnClass="PDIF" inst="1" lnType="PDIF_Type" desc="Differential protection"/>
        </LDevice>
        <LDevice inst="MEAS" desc="Measurements">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_SV_Meas" desc="Sampled values dataset">
              <FCDA ldInst="MEAS" lnClass="TVTR" lnInst="1" doName="Vol" daName="instMag" fc="MX"/>
              <FCDA ldInst="MEAS" lnClass="TCTR" lnInst="1" doName="Amp" daName="instMag" fc="MX"/>
            </DataSet>
            <SampledValueControl name="SvCB_Meas" datSet="DS_SV_Meas" confRev="1" smpRate="80" nofASDU="1" desc="Sampled values">
              <SmvOpts sampleRate="true" dataSet="true" sampleSynchronized="true"/>
            </SampledValueControl>
          </LN0>
          <LN lnClass="TVTR" inst="1" lnType="TVTR_Type" desc="Voltage transformer"/>
          <LN lnClass="TCTR" inst="1" lnType="TCTR_Type" desc="Current transformer"/>
        </LDevice>
      </Server>
    </AccessPoint>
    <AccessPoint name="G1"/>
  </IED>

  <!-- IED 6: Bay controller / merging unit -->
  <IED name="TST_B_BB1_EW810" desc="Bay Controller Busbar" type="RIO600" manufacturer="ABB" configVersion="1.0">
    <AccessPoint name="S1">
      <Server>
        <Authentication none="true"/>
        <LDevice inst="MEAS" desc="Measurements">
          <LN0 lnClass="LLN0" inst="" lnType="LLN0_Type" desc="Logical Node Zero">
            <DataSet name="DS_SV_Meas" desc="Sampled values dataset">
              <FCDA ldInst="MEAS" lnClass="TVTR" lnInst="1" doName="Vol" daName="instMag" fc="MX"/>
              <FCDA ldInst="MEAS" lnClass="TCTR" lnInst="1" doName="Amp" daName="instMag" fc="MX"/>
            </DataSet>
            <SampledValueControl name="SvCB_Meas" datSet="DS_SV_Meas" confRev="1" smpRate="80" nofASDU="1" desc="Sampled values">
              <SmvOpts sampleRate="true" dataSet="true" sampleSynchronized="true"/>
            </SampledValueControl>
          </LN0>
          <LN lnClass="TVTR" inst="1" lnType="TVTR_Type" desc="Voltage transformer"/>
          <LN lnClass="TCTR" inst="1" lnType="TCTR_Type" desc="Current transformer"/>
        </LDevice>
      </Server>
    </AccessPoint>
    <AccessPoint name="G1"/>
  </IED>

  <Substation name="TST" desc="Test Substation">
    <VoltageLevel name="A" desc="110 kV">
      <Voltage unit="V" multiplier="k">110</Voltage>
      <Bay name="BB1" desc="Busbar 1">
        <ConductingEquipment type="DIS" name="DIS_1" desc="Disconnector 1"/>
        <ConductingEquipment type="CBR" name="CBR_1" desc="Circuit Breaker 1">
          <LNode iedName="TST_A_BB1_EW001" ldInst="PROT" lnClass="CSWI" lnInst="1"/>
        </ConductingEquipment>
        <LNode iedName="TST_A_BB1_EW001" ldInst="PROT" lnClass="LLN0" lnInst=""/>
        <LNode iedName="TST_A_BB1_EW002" ldInst="MEAS" lnClass="LLN0" lnInst=""/>
      </Bay>
      <Bay name="FDR1" desc="Feeder 1">
        <ConductingEquipment type="CBR" name="CBR_F1" desc="Feeder 1 Breaker">
          <LNode iedName="TST_A_FDR_EW010" ldInst="PROT" lnClass="CSWI" lnInst="1"/>
        </ConductingEquipment>
        <LNode iedName="TST_A_FDR_EW010" ldInst="PROT" lnClass="LLN0" lnInst=""/>
      </Bay>
      <Bay name="FDR2" desc="Feeder 2">
        <ConductingEquipment type="CBR" name="CBR_F2" desc="Feeder 2 Breaker">
          <LNode iedName="TST_A_FDR_EW011" ldInst="PROT" lnClass="CSWI" lnInst="1"/>
        </ConductingEquipment>
        <LNode iedName="TST_A_FDR_EW011" ldInst="PROT" lnClass="LLN0" lnInst=""/>
      </Bay>
      <Bay name="TRF1" desc="Transformer 1">
        <ConductingEquipment type="CBR" name="CBR_T1" desc="Transformer 1 Breaker">
          <LNode iedName="TST_A_TRF_EW020" ldInst="PROT" lnClass="CSWI" lnInst="1"/>
        </ConductingEquipment>
        <LNode iedName="TST_A_TRF_EW020" ldInst="PROT" lnClass="LLN0" lnInst=""/>
      </Bay>
    </VoltageLevel>
    <VoltageLevel name="B" desc="11 kV">
      <Voltage unit="V" multiplier="k">11</Voltage>
      <Bay name="BB1" desc="11 kV Busbar">
        <ConductingEquipment type="CBR" name="CBR_11kV" desc="11 kV Breaker">
          <LNode iedName="TST_B_BB1_EW810" ldInst="MEAS" lnClass="LLN0" lnInst=""/>
        </ConductingEquipment>
      </Bay>
    </VoltageLevel>
  </Substation>

  <DataTypeTemplates>
    <LNodeType id="LLN0_Type" lnClass="LLN0">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Health" type="ENS_HealthKind"/>
      <DO name="NamPlt" type="LPL"/>
    </LNodeType>
    <LNodeType id="PTRC_Type" lnClass="PTRC">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Tr" type="ACT"/>
    </LNodeType>
    <LNodeType id="CSWI_Type" lnClass="CSWI">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Pos" type="DPC"/>
    </LNodeType>
    <LNodeType id="PIOC_Type" lnClass="PIOC">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Op" type="ACT"/>
    </LNodeType>
    <LNodeType id="PDIF_Type" lnClass="PDIF">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Op" type="ACT"/>
    </LNodeType>
    <LNodeType id="TVTR_Type" lnClass="TVTR">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Vol" type="MV"/>
    </LNodeType>
    <LNodeType id="TCTR_Type" lnClass="TCTR">
      <DO name="Beh" type="ENS_BehaviourModeKind"/>
      <DO name="Amp" type="MV"/>
    </LNodeType>
    <DOType id="ENS_BehaviourModeKind" cdc="ENS">
      <DA name="stVal" bType="Enum" type="BehaviourModeKind" fc="ST"/>
      <DA name="q" bType="Quality" fc="ST"/>
      <DA name="t" bType="Timestamp" fc="ST"/>
    </DOType>
    <DOType id="ENS_HealthKind" cdc="ENS">
      <DA name="stVal" bType="Enum" type="HealthKind" fc="ST"/>
      <DA name="q" bType="Quality" fc="ST"/>
      <DA name="t" bType="Timestamp" fc="ST"/>
    </DOType>
    <DOType id="ACT" cdc="ACT">
      <DA name="general" bType="BOOLEAN" fc="ST"/>
      <DA name="q" bType="Quality" fc="ST"/>
      <DA name="t" bType="Timestamp" fc="ST"/>
    </DOType>
    <DOType id="DPC" cdc="DPC">
      <DA name="stVal" bType="Enum" type="CtlModels" fc="ST"/>
      <DA name="q" bType="Quality" fc="ST"/>
      <DA name="t" bType="Timestamp" fc="ST"/>
    </DOType>
    <DOType id="MV" cdc="MV">
      <DA name="instMag" bType="FLOAT32" fc="MX"/>
      <DA name="q" bType="Quality" fc="MX"/>
      <DA name="t" bType="Timestamp" fc="MX"/>
    </DOType>
    <DOType id="LPL" cdc="LPL">
      <DA name="vendor" bType="VisString255" fc="DC"/>
      <DA name="swRev" bType="VisString255" fc="DC"/>
      <DA name="d" bType="VisString255" fc="DC"/>
    </DOType>
    <EnumType id="BehaviourModeKind">
      <EnumVal ord="1">on</EnumVal>
      <EnumVal ord="2">blocked</EnumVal>
      <EnumVal ord="3">test</EnumVal>
      <EnumVal ord="4">test/blocked</EnumVal>
      <EnumVal ord="5">off</EnumVal>
    </EnumType>
    <EnumType id="HealthKind">
      <EnumVal ord="1">Ok</EnumVal>
      <EnumVal ord="2">Warning</EnumVal>
      <EnumVal ord="3">Alarm</EnumVal>
    </EnumType>
    <EnumType id="CtlModels">
      <EnumVal ord="0">status-only</EnumVal>
      <EnumVal ord="1">direct-with-normal-security</EnumVal>
      <EnumVal ord="2">sbo-with-normal-security</EnumVal>
    </EnumType>
  </DataTypeTemplates>

</SCL>
