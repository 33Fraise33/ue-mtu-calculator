import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  calculate,
  decodeState,
  DEFAULT_STATE,
  encodeState,
  getGtpProfileInfo,
  minimumUePacketSize,
  type CalculatorState,
  type BreakdownRow,
  type IpVersion,
  type OverheadGroup,
} from "./calculator";

const ipOptions: IpVersion[] = ["IPv4", "IPv6"];

function HelpTip({ text }: { text: string }) {
  return <span className="help-tip"><button type="button" aria-label="Show help">?</button><span className="help-popover" role="tooltip">{text}</span></span>;
}

function SelectField<T extends string>({ label, value, options, onChange, hint, optionLabel, help, disabled = false }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void; hint?: string; optionLabel?: (value: T) => string; help?: string; disabled?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label}{help && <HelpTip text={help} />}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option} value={option}>{optionLabel ? optionLabel(option) : option}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
      <span>{label}</span>
    </label>
  );
}

function formatBytes(value: number) {
  return `${Math.round(value).toLocaleString("de-DE")} B`;
}

function LayerCards({ groups, activeGroup, setActiveGroup }: { groups: OverheadGroup[]; activeGroup: string | null; setActiveGroup: (id: string | null) => void }) {
  return (
    <div className="layer-cards">
      {groups.map((group) => (
        <article className={`layer-card layer-${group.id} ${activeGroup === group.id ? "focused" : ""}`} key={group.id} onMouseEnter={() => setActiveGroup(group.id)} onMouseLeave={() => setActiveGroup(null)}>
          <div className="layer-card-head"><div><span className="layer-mark" /><h3>{group.label}</h3></div><b>+{formatBytes(group.bytes)}</b></div>
          <p>{group.detail}</p>
          <div className="layer-items">{group.rows.map((row) => <div key={row.id}><span>{row.label}</span><b>{formatBytes(row.bytes)}</b></div>)}</div>
        </article>
      ))}
    </div>
  );
}

function CompositionBar({ groups, ueBytes, wanMtu, encapsulatedPacket, headroom, activeGroup, setActiveGroup }: { groups: OverheadGroup[]; ueBytes: number; wanMtu: number; encapsulatedPacket: number; headroom: number; activeGroup: string | null; setActiveGroup: (id: string | null) => void }) {
  const overhead = groups.reduce((sum, group) => sum + group.bytes, 0);
  const overflow = Math.max(0, -headroom);
  return (
    <div className="composition-wrap">
      <div className="wire-summary"><span><b>Total on wire</b> {formatBytes(encapsulatedPacket)}</span><span><b>WAN MTU</b> {formatBytes(wanMtu)}</span><strong className={headroom < 0 ? "overflow-text" : ""}>{headroom >= 0 ? `Headroom +${formatBytes(headroom)}` : `${formatBytes(overflow)} over MTU`}</strong></div>
      <div className={`composition-bar ${headroom < 0 ? "overflow" : ""}`} aria-label="On wire packet composition">
        <div className={`composition-overhead ${headroom > 0 ? "with-headroom" : "no-headroom"}`} style={{ flex: `${overhead} 1 0`, "--block-count": groups.length } as CSSProperties}>
          {groups.map((group) => <div key={group.id} className={`composition-block block-${group.id} ${activeGroup === group.id ? "active" : ""}`} style={{ flex: `${group.bytes} 1 0` }} onMouseEnter={() => setActiveGroup(group.id)} onMouseLeave={() => setActiveGroup(null)}><span>{group.label}</span><b>{formatBytes(group.bytes)}</b></div>)}
        </div>
        <div className={`composition-ue ${headroom > 0 ? "before-headroom" : "bar-end"}`} style={{ flex: `${ueBytes} 1 0` }}><strong>UE packet</strong><span>{formatBytes(ueBytes)}</span></div>
        {headroom > 0 && <div className="composition-headroom" style={{ flex: `${headroom} 1 0` }}><strong>Headroom</strong></div>}
      </div>
      <div className="composition-caption"><span>Minimum block widths make this illustrative, not strictly proportional</span></div>
    </div>
  );
}

function App() {
  const [state, setState] = useState<CalculatorState>(() => decodeState(window.location.search));
  const [packetDraft, setPacketDraft] = useState(() => String(decodeState(window.location.search).ueTransmitPacketSize));
  const result = useMemo(() => calculate(state), [state]);

  useEffect(() => {
    const query = encodeState(state);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [state]);

  function update<K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }
  const gtpOptions = ["4g", "5g-qfi", "5g-qfi-ppi", "5g-pdcp", "5g-long-pdcp", "5g-qos-dl", "5g-qos-ul", "5g-custom"] as const;
  const transportOptions = ["standard", "pppoe", "jumbo"] as const;
  const cbcOptions = ["sha256-128", "sha384-192", "sha512-256"] as const;
  const selectedProfile = getGtpProfileInfo(state.gtpProfile, state.gtpCustomExtension);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  return (
    <main className="shell">
      <header className="hero">
        <div className="eyebrow"><span className="signal-dot" /> UE MTU Calculator - Transport Overhead</div>
        <div className="hero-grid">
          <div>
            <h1>See the packet before it hits the wire.</h1>
            <p className="lede">A transparent, layer by layer calculator for UE packets crossing GTP-U and an optional IPsec security gateway.</p>
          </div>
          <div className="hero-note"><span>MODEL</span><b>UE IP → GTP-U → IPsec tunnel → WAN</b><small>Every byte stays visible. Padding is solved for the actual packet size.</small></div>
        </div>
      </header>

      <section className="workspace">
        <div className="controls-column">
          <div className="section-kicker">01 / PATH INPUTS</div>
          <section className="card control-card">
            <div className="card-top"><div><h2>Backbone Transport</h2><p>Choose the enclosing IP budget and GTP-U transport.</p></div><span className="step-badge">WAN</span></div>
            <div className="fields">
               <SelectField label="Transport MTU" value={state.transport} options={transportOptions} onChange={(value) => update("transport", value)} optionLabel={(value) => ({ standard: "Standard Ethernet (1.500 bytes)", pppoe: "PPPoE (1.492 bytes)", jumbo: "Jumbo Frames (9.000 bytes)" })[value]} />
              <SelectField label="GTP-U outer IP" value={state.gtpIp} options={ipOptions} onChange={(value) => update("gtpIp", value)} />
              <SelectField label="GTP-U profile" value={state.gtpProfile} options={gtpOptions} onChange={(value) => update("gtpProfile", value)} optionLabel={(value) => `${getGtpProfileInfo(value, state.gtpCustomExtension).label} (${8 + (value === "4g" ? 0 : 4) + getGtpProfileInfo(value, state.gtpCustomExtension).extensionBytes} B GTP-U)`} help={`${selectedProfile.description} With GTP-U UDP and the selected outer IP, add 28 bytes for IPv4 or 48 bytes for IPv6.`} hint={state.gtpProfile === "4g" ? "Base GTP-U header only" : state.gtpProfile === "5g-custom" ? "Enter a four byte aligned extension chain length" : "Standard GTP-U extension profile"} />
              {state.gtpProfile === "5g-custom" && <label className="field"><span>Custom Extension Bytes</span><input type="number" min="0" step="4" value={state.gtpCustomExtension} onChange={(event) => update("gtpCustomExtension", Number(event.target.value))} /><small>Must be a non negative multiple of 4.</small></label>}
            </div>
          </section>

          <div className="section-kicker">02 / SECURITY GATEWAY</div>
          <section className="card control-card security-card">
            <div className="card-top"><div><h2>IPsec tunnel</h2><p>ESP tunnel mode with implementation visible crypto details.</p></div><span className={`step-badge ${state.ipsecEnabled ? "active" : ""}`}>{state.ipsecEnabled ? "ON" : "OFF"}</span></div>
            <Toggle label="Enable IPsec security gateway" checked={state.ipsecEnabled} onChange={(value) => update("ipsecEnabled", value)} />
            <div className={`fields ${!state.ipsecEnabled ? "muted-fields" : ""}`}>
              <SelectField label="IPsec outer IP" value={state.ipsecIp} options={ipOptions} disabled={!state.ipsecEnabled} onChange={(value) => update("ipsecIp", value)} />
              <Toggle label="NAT traversal / UDP 4500" checked={state.natTraversal} disabled={!state.ipsecEnabled} onChange={(value) => update("natTraversal", value)} />
              <SelectField label="ESP encryption" value={state.cipher} options={["gcm", "cbc"] as const} disabled={!state.ipsecEnabled} onChange={(value) => update("cipher", value)} optionLabel={(value) => value === "gcm" ? "AES-GCM" : "AES-CBC"} />
              {state.cipher === "gcm" ? <>
                <SelectField label="AES key size" value={String(state.aesKeyBits)} options={["128", "192", "256"] as const} disabled={!state.ipsecEnabled} onChange={(value) => update("aesKeyBits", Number(value) as 128 | 192 | 256)} hint="Key size changes security, not wire overhead." />
                <SelectField label="GCM authentication tag" value={String(state.gcmTag)} options={["8", "12", "16"] as const} disabled={!state.ipsecEnabled} onChange={(value) => update("gcmTag", Number(value) as 8 | 12 | 16)} optionLabel={(value) => `${value} bytes`} hint="RFC 4106 supports 8, 12, and 16 bytes." />
              </> : <>
                <SelectField label="AES key size" value={String(state.aesKeyBits)} options={["128", "192", "256"] as const} disabled={!state.ipsecEnabled} onChange={(value) => update("aesKeyBits", Number(value) as 128 | 192 | 256)} hint="AES-CBC block size remains 16 bytes." />
                <SelectField label="CBC integrity" value={state.cbcIntegrity} options={cbcOptions} disabled={!state.ipsecEnabled} onChange={(value) => update("cbcIntegrity", value)} optionLabel={(value) => ({ "sha256-128": "HMAC SHA-256 128", "sha384-192": "HMAC SHA-384 192", "sha512-256": "HMAC SHA-512 256" })[value]} />
              </>}
            </div>
            <div className="callout">GCM provides authenticated encryption, so there is no separate HMAC. ECP384 is an IKE key exchange choice and adds no per packet bytes.</div>
          </section>

          <div className="section-kicker">03 / UE EDGE</div>
          <section className="card control-card">
            <div className="card-top"><div><h2>Client Packet on the Bearer</h2><p>UE IP version affects MSS advice and the IPv6 minimum MTU check.</p></div><span className="step-badge">UE</span></div>
            <div className="fields">
              <SelectField label="UE / client IP" value={state.ueIp} options={ipOptions} onChange={(value) => { const minimum = minimumUePacketSize(value); setState((current) => ({ ...current, ueIp: value, ueTransmitPacketSize: minimum })); setPacketDraft(String(minimum)); }} />
              <label className="field"><span>UE Transmit Packet Size</span><input type="text" inputMode="numeric" minLength={1} maxLength={5} value={packetDraft} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const value = event.target.value.replace(/\D/g, ""); setPacketDraft(value); if (value !== "") update("ueTransmitPacketSize", Number(value)); }} onBlur={() => { const parsed = Number(packetDraft); const minimum = minimumUePacketSize(state.ueIp); const next = Number.isFinite(parsed) ? Math.min(65535, Math.max(minimum, parsed)) : minimum; setPacketDraft(String(next)); update("ueTransmitPacketSize", next); }} /><small>Minimum {minimumUePacketSize(state.ueIp)} bytes for an IP header and 8 bytes of data.</small></label>
            </div>
          </section>
          <button className="reset-button" onClick={() => { setState(DEFAULT_STATE); setPacketDraft(String(DEFAULT_STATE.ueTransmitPacketSize)); }}>Reset to recommended defaults</button>
        </div>

        <div className="results-column">
          <div className="section-kicker">LIVE PATH RESULT</div>
           <section className="metric-grid" aria-label="Live path metrics" aria-live="polite">
             <div className="metric-card accent"><span>MAX UE MTU</span><strong>{formatBytes(result.maxUeMtu)}</strong><small>Largest UE IP packet that fits</small></div>
             <div className="metric-card"><span>CURRENT OVERHEAD</span><strong>{formatBytes(result.totalOverhead)}</strong><small>At UE transmit packet size</small></div>
             <div className="metric-card"><span className="metric-label">MAXIMUM OVERHEAD <HelpTip text={`${state.cipher === "cbc" ? "AES-CBC" : "AES-GCM"} alignment padding ${formatBytes(result.configuredPadding)} selected\nPossible range 0 to ${formatBytes(result.maximumAlignmentPadding)}\nWorst case modeled overhead ${formatBytes(result.worstCaseOverhead)}`} /></span><strong>{formatBytes(result.worstCaseOverhead)}</strong><small>Including maximum alignment padding</small></div>
          </section>

           {result.warnings.length > 0 && <div className="warning-stack" role="alert">{result.warnings.map((warning) => <div className="warning" key={warning}><span>!</span>{warning}</div>)}</div>}

          <section className="card path-card">
             <div className="card-top"><div><h2>Encapsulation Path</h2></div><span className="path-chip">{state.ueIp} UE</span></div>
            <CompositionBar groups={result.groups} ueBytes={state.ueTransmitPacketSize} wanMtu={result.wanMtu} encapsulatedPacket={result.encapsulatedPacket} headroom={result.headroom} activeGroup={activeGroup} setActiveGroup={setActiveGroup} />
            <LayerCards groups={result.groups} activeGroup={activeGroup} setActiveGroup={setActiveGroup} />
          </section>

          <section className="mss-grid">
             <div className={`mss-card ${state.ueIp === "IPv4" ? "selected" : ""}`}><span>IPv4 TCP MSS</span><strong>{formatBytes(result.mss.ipv4)}</strong><small>MTU − 20-byte IP − 20-byte TCP</small></div>
             <div className={`mss-card ${state.ueIp === "IPv6" ? "selected" : ""}`}><span>IPv6 TCP MSS</span><strong>{formatBytes(result.mss.ipv6)}</strong><small>MTU − 40-byte IP − 20-byte TCP</small></div>
          </section>

          <details className="card notes-card"><summary>Model notes and standards</summary><div className="notes-content"><p>IPsec uses tunnel mode: the complete GTP-U packet is encrypted inside ESP. AES-CBC alignment padding is calculated automatically from the packet size and ranges from 0 to 15 bytes. AES-GCM alignment padding is calculated automatically and ranges from 0 to 3 bytes.</p><p>Optional IP extension headers and ESP Traffic Flow Confidentiality padding are outside this calculator because they are unusual, policy specific, and not intrinsic transport overhead. Ethernet framing, VLAN tags, radio headers, and provider specific encapsulations are also outside this model.</p><p>GTP-U 5G standard mode includes the 4 byte optional fields block plus a 4 byte PDU Session Container. Custom extensions are added in 4 byte units. Standards: RFC 3602, RFC 3948, RFC 4106, RFC 4303, RFC 4868, RFC 8200, and 3GPP TS 29.281.</p></div></details>
        </div>
      </section>
      <footer><span>UE MTU Calculator - Transport Overhead</span><span className="footer-center">Calculations run locally in your browser</span><div className="footer-meta"><span>Created by <a href="https://unitix.be" rel="noreferrer">Unitix</a> (2026)</span><a className="github-link" href="https://github.com/33Fraise33/ue-mtu-calculator" target="_blank" rel="noreferrer" aria-label="View source on GitHub" title="View source on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.6-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" /></svg></a></div></footer>
    </main>
  );
}

export default App;
