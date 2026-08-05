export type IpVersion = "IPv4" | "IPv6";
export type TransportProfile = "standard" | "pppoe" | "jumbo";
export type GtpProfile = "4g" | "5g-qfi" | "5g-qfi-ppi" | "5g-pdcp" | "5g-long-pdcp" | "5g-qos-dl" | "5g-qos-ul" | "5g-custom";
export type Cipher = "gcm" | "cbc";
export type GcmTag = 8 | 12 | 16;
export type CbcIntegrity = "sha256-128" | "sha384-192" | "sha512-256";

export interface GtpProfileInfo {
  label: string;
  extensionBytes: number;
  description: string;
}

export interface CalculatorState {
  transport: TransportProfile;
  gtpIp: IpVersion;
  gtpProfile: GtpProfile;
  gtpCustomExtension: number;
  ipsecEnabled: boolean;
  ipsecIp: IpVersion;
  natTraversal: boolean;
  cipher: Cipher;
  aesKeyBits: 128 | 192 | 256;
  gcmTag: GcmTag;
  cbcIntegrity: CbcIntegrity;
  ueIp: IpVersion;
  ueTransmitPacketSize: number;
}

export interface BreakdownRow {
  id: string;
  label: string;
  bytes: number;
  kind: "capacity" | "overhead" | "variable" | "payload";
  detail: string;
}

export type OverheadGroupId = "gtp-transport" | "gtp-u" | "ipsec-transport" | "esp";

export interface OverheadGroup {
  id: OverheadGroupId;
  label: string;
  bytes: number;
  detail: string;
  rows: BreakdownRow[];
}

export interface CalculationResult {
  wanMtu: number;
  gtpOverhead: number;
  ipsecOverhead: number;
  totalOverhead: number;
  encapsulatedPacket: number;
  maxUeMtu: number;
  headroom: number;
  configuredPadding: number;
  maximumAlignmentPadding: number;
  worstCaseOverhead: number;
  mss: { ipv4: number; ipv6: number };
  rows: BreakdownRow[];
  groups: OverheadGroup[];
  warnings: string[];
}

export const DEFAULT_STATE: CalculatorState = {
  transport: "standard",
  gtpIp: "IPv4",
  gtpProfile: "5g-qfi",
  gtpCustomExtension: 0,
  ipsecEnabled: true,
  ipsecIp: "IPv4",
  natTraversal: true,
  cipher: "gcm",
  aesKeyBits: 256,
  gcmTag: 16,
  cbcIntegrity: "sha256-128",
  ueIp: "IPv6",
  ueTransmitPacketSize: 48,
};

export const TRANSPORT_MTU: Record<TransportProfile, number> = {
  standard: 1500,
  pppoe: 1492,
  jumbo: 9000,
};

const IP_HEADER: Record<IpVersion, number> = { IPv4: 20, IPv6: 40 };
const INTEGRITY_TAG: Record<CbcIntegrity, number> = {
  "sha256-128": 16,
  "sha384-192": 24,
  "sha512-256": 32,
};

function formatCount(value: number) {
  return Math.round(value).toLocaleString("de-DE");
}

export const GTP_PROFILE_INFO: Record<Exclude<GtpProfile, "5g-custom">, GtpProfileInfo> = {
  "4g": {
    label: "4G Base",
    extensionBytes: 0,
    description: "4G baseline: the mandatory 8 byte GTP-U header only. No GTP-U extension header is selected.",
  },
  "5g-qfi": {
    label: "5G Standard",
    extensionBytes: 4,
    description: "Standard minimum 5G N3 or N9 profile: 8 byte GTP-U base header, 4 byte optional-fields block, and a 4 byte PDU Session Container carrying basic QFI information. Total GTP-U header: 16 bytes.",
  },
  "5g-qfi-ppi": {
    label: "5G QFI with PPI",
    extensionBytes: 8,
    description: "5G PDU Session Container with QFI and PPI. PPI requires the extension to occupy 8 bytes. Total GTP-U header: 20 bytes.",
  },
  "5g-pdcp": {
    label: "5G with PDCP PDU Number",
    extensionBytes: 8,
    description: "5G PDU Session Container plus the fixed 4 byte PDCP PDU Number extension. Total GTP-U header: 20 bytes.",
  },
  "5g-long-pdcp": {
    label: "5G with Long PDCP PDU Number",
    extensionBytes: 12,
    description: "5G PDU Session Container plus the fixed 8 byte Long PDCP PDU Number extension. Total GTP-U header: 24 bytes.",
  },
  "5g-qos-dl": {
    label: "5G URLLC QoS Monitoring DL",
    extensionBytes: 12,
    description: "Downlink QoS Monitoring timestamp profile. URLLC itself does not add fixed overhead; this preset represents selected DL monitoring metadata. Total GTP-U header: 24 bytes.",
  },
  "5g-qos-ul": {
    label: "5G URLLC QoS Monitoring UL",
    extensionBytes: 28,
    description: "Uplink QoS Monitoring timestamp profile with three timestamp fields. URLLC itself does not add fixed overhead; this is a selected monitoring profile. Total GTP-U header: 40 bytes.",
  },
};

export function getGtpProfileInfo(profile: GtpProfile, customExtensionBytes = 0): GtpProfileInfo {
  if (profile === "5g-custom") {
    return {
      label: "5G Custom Extension Chain",
      extensionBytes: customExtensionBytes,
      description: `Custom GTP-U extension chain. Enter the complete extension chain length in 4 byte units. Total GTP-U header: ${8 + 4 + customExtensionBytes} bytes.`,
    };
  }
  return GTP_PROFILE_INFO[profile];
}

export function minimumUePacketSize(ip: IpVersion): number {
  return IP_HEADER[ip] + 8;
}

const isValidExtension = (bytes: number) =>
  Number.isInteger(bytes) && bytes >= 0 && bytes <= 65535 && bytes % 4 === 0;

export function validateState(state: CalculatorState): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(state.ueTransmitPacketSize) || state.ueTransmitPacketSize < 0 || state.ueTransmitPacketSize > 65535) {
    errors.push("UE transmit packet size must be a whole number from 0 through 65535 bytes.");
  }
  if (!isValidExtension(state.gtpCustomExtension)) {
    errors.push("Custom GTP-U extension bytes must be a non-negative multiple of 4.");
  }
  return errors;
}

function gtpRows(state: CalculatorState): BreakdownRow[] {
  const rows: BreakdownRow[] = [
    { id: "gtp-ip", label: `${state.gtpIp} GTP-U outer header`, bytes: IP_HEADER[state.gtpIp], kind: "overhead", detail: "Outer IP header carrying the GTP-U transport packet." },
    { id: "gtp-udp", label: "GTP-U UDP", bytes: 8, kind: "overhead", detail: "UDP header carrying GTP-U." },
    { id: "gtp-base", label: "GTP-U base header", bytes: 8, kind: "overhead", detail: "Mandatory GTP-U header: flags, type, length, and TEID." },
  ];
  if (state.gtpProfile !== "4g") {
    rows.push({ id: "gtp-optional", label: "GTP-U optional fields", bytes: 4, kind: "overhead", detail: "Sequence Number, N-PDU Number, and Next Extension Header Type when E, S, or PN is used." });
    const profile = getGtpProfileInfo(state.gtpProfile, state.gtpCustomExtension);
    rows.push({ id: "gtp-psc", label: profile.label, bytes: profile.extensionBytes, kind: "variable", detail: profile.description });
  }
  return rows;
}

function ipsecRows(state: CalculatorState, gtpOverhead: number): { rows: BreakdownRow[]; fixed: number; padding: number; alignment: number } {
  if (!state.ipsecEnabled) return { rows: [], fixed: 0, padding: 0, alignment: 1 };
  const iv = state.cipher === "cbc" ? 16 : 8;
  const tag = state.cipher === "cbc" ? INTEGRITY_TAG[state.cbcIntegrity] : state.gcmTag;
  const alignment = state.cipher === "cbc" ? 16 : 4;
  const fixed = IP_HEADER[state.ipsecIp] + (state.natTraversal ? 8 : 0) + 8 + iv + tag;
  const packetBeforeEspTrailer = state.ueTransmitPacketSize + gtpOverhead;
  const padding = (alignment - ((packetBeforeEspTrailer + 2) % alignment)) % alignment;
  const rows: BreakdownRow[] = [
    { id: "ipsec-ip", label: `${state.ipsecIp} IPsec outer header`, bytes: IP_HEADER[state.ipsecIp], kind: "overhead", detail: "Outer IP header for the security gateway tunnel." },
  ];
  if (state.natTraversal) rows.push({ id: "nat-t", label: "NAT traversal UDP 4500", bytes: 8, kind: "overhead", detail: "UDP encapsulation required for NAT traversal." });
  rows.push({ id: "esp-header", label: "ESP header", bytes: 8, kind: "overhead", detail: "SPI and sequence number." });
  rows.push({ id: "esp-iv", label: `${state.cipher === "cbc" ? "AES-CBC" : "AES-GCM"} explicit IV`, bytes: iv, kind: "overhead", detail: state.cipher === "cbc" ? "AES-CBC uses a 16 byte explicit IV." : "AES-GCM ESP uses an 8 byte explicit IV." });
  rows.push({ id: "esp-padding", label: "ESP alignment padding", bytes: padding, kind: "variable", detail: state.cipher === "cbc" ? "0 to 15 bytes to align encrypted payload plus trailer to a 16 byte AES block." : "0 to 3 bytes to align the GCM ESP trailer to a 4 byte boundary." });
  rows.push({ id: "esp-trailer", label: "ESP trailer", bytes: 2, kind: "overhead", detail: "Pad Length and Next Header fields." });
  rows.push({ id: "esp-auth", label: state.cipher === "cbc" ? `HMAC-SHA ${state.cbcIntegrity === "sha256-128" ? "256 128" : state.cbcIntegrity === "sha384-192" ? "384 192" : "512 256"} ICV` : `AES-GCM ${state.gcmTag * 8} authentication tag`, bytes: tag, kind: "overhead", detail: "Authenticated encryption tag or ICV transmitted on every packet." });
  return { rows, fixed, padding, alignment };
}

function makeGroups(rows: BreakdownRow[]): OverheadGroup[] {
  const definitions: Array<[OverheadGroupId, string, string, string[]]> = [
    ["ipsec-transport", "IPsec transport", "Outer IP and optional NAT traversal UDP around ESP.", ["ipsec-ip", "nat-t"]],
    ["esp", "ESP", "ESP header, cryptographic IV, alignment padding, trailer, and authentication data.", ["esp-header", "esp-iv", "esp-padding", "esp-trailer", "esp-auth"]],
    ["gtp-transport", "GTP-U transport", "Outer IP and UDP carrying GTP-U.", ["gtp-ip", "gtp-udp"]],
    ["gtp-u", "GTP-U protocol", "GTP-U base, optional fields, and selected 5G extension chain.", ["gtp-base", "gtp-optional", "gtp-psc"]],
  ];
  return definitions.map(([id, label, detail, rowIds]) => {
    const groupRows = rows.filter((row) => rowIds.includes(row.id));
    return { id, label, detail, rows: groupRows, bytes: groupRows.reduce((sum, row) => sum + row.bytes, 0) };
  }).filter((group) => group.bytes > 0);
}

export function calculate(state: CalculatorState): CalculationResult {
  const errors = validateState(state);
  const wanMtu = TRANSPORT_MTU[state.transport];
  const gtp = gtpRows(state);
  const gtpOverhead = gtp.reduce((sum, row) => sum + row.bytes, 0);
  const ipsec = ipsecRows(state, gtpOverhead);
  const ipsecOverhead = ipsec.fixed + (state.ipsecEnabled ? 2 + ipsec.padding : 0);
  const totalOverhead = gtpOverhead + ipsecOverhead;
  const encapsulatedPacket = state.ueTransmitPacketSize + totalOverhead;
  let maxUeMtu = Math.max(0, wanMtu - gtpOverhead);
  if (state.ipsecEnabled) {
    const availableEncrypted = Math.floor((wanMtu - ipsec.fixed) / ipsec.alignment) * ipsec.alignment;
    maxUeMtu = Math.max(0, availableEncrypted - 2 - gtpOverhead);
  }
  const rows: BreakdownRow[] = [
    { id: "wan", label: `${state.transport === "standard" ? "Standard Ethernet" : state.transport === "pppoe" ? "PPPoE" : "Jumbo"} MTU budget`, bytes: wanMtu, kind: "capacity", detail: "Maximum enclosing IP packet size available on the bearer/WAN." },
    ...gtp,
    { id: "ue-packet", label: `${state.ueIp} UE transmit packet`, bytes: state.ueTransmitPacketSize, kind: "payload", detail: "UE IP packet presented to the GTP-U encapsulation path." },
    ...ipsec.rows,
  ];
  const warnings = [...errors];
  if (state.ueIp === "IPv6" && maxUeMtu < 1280) warnings.push("Calculated maximum IPv6 UE MTU is below the 1280-byte minimum.");
  if (encapsulatedPacket > wanMtu) warnings.push(`UE transmit packet size exceeds the selected bearer MTU by ${formatCount(encapsulatedPacket - wanMtu)} bytes after encapsulation.`);
  return {
    wanMtu,
    gtpOverhead,
    ipsecOverhead,
    totalOverhead,
    encapsulatedPacket,
    maxUeMtu,
    headroom: wanMtu - encapsulatedPacket,
    configuredPadding: ipsec.padding,
    maximumAlignmentPadding: state.ipsecEnabled ? (ipsec.alignment - 1) : 0,
    worstCaseOverhead: gtpOverhead + (state.ipsecEnabled ? ipsec.fixed + 2 + (ipsec.alignment - 1) : 0),
    mss: { ipv4: Math.max(0, maxUeMtu - 40), ipv6: Math.max(0, maxUeMtu - 60) },
    rows,
    groups: makeGroups([...gtp, ...ipsec.rows]),
    warnings,
  };
}

export function encodeState(state: CalculatorState): string {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (typeof value === "object") Object.entries(value).forEach(([nestedKey, nestedValue]) => params.set(nestedKey, String(nestedValue)));
    else params.set(key, String(value));
  });
  return params.toString();
}

export function decodeState(search: string): CalculatorState {
  const p = new URLSearchParams(search);
  const state = { ...DEFAULT_STATE };
  const transport = p.get("transport");
  if (transport === "standard" || transport === "pppoe" || transport === "jumbo") state.transport = transport;
  const ip = (key: string): IpVersion | undefined => p.get(key) === "IPv4" || p.get(key) === "IPv6" ? p.get(key) as IpVersion : undefined;
  state.gtpIp = ip("gtpIp") ?? state.gtpIp;
  state.ipsecIp = ip("ipsecIp") ?? state.ipsecIp;
  state.ueIp = ip("ueIp") ?? state.ueIp;
  const profile = p.get("gtpProfile");
  if (profile === "4g") state.gtpProfile = profile;
  if (profile === "5g") state.gtpProfile = "5g-qfi";
  if (profile === "5g-qfi" || profile === "5g-qfi-ppi" || profile === "5g-pdcp" || profile === "5g-long-pdcp" || profile === "5g-qos-dl" || profile === "5g-qos-ul" || profile === "5g-custom") state.gtpProfile = profile;
  const cipher = p.get("cipher");
  if (cipher === "gcm" || cipher === "cbc") state.cipher = cipher;
  const bool = (key: string, fallback: boolean) => p.has(key) ? p.get(key) === "true" : fallback;
  state.ipsecEnabled = bool("ipsecEnabled", state.ipsecEnabled);
  state.natTraversal = bool("natTraversal", state.natTraversal);
  const ext = Number(p.get("gtpCustomExtension"));
  if (Number.isFinite(ext)) state.gtpCustomExtension = ext;
  const mtu = Number(p.get("ueTransmitPacketSize"));
  if (Number.isFinite(mtu)) state.ueTransmitPacketSize = mtu;
  const key = Number(p.get("aesKeyBits"));
  if (key === 128 || key === 192 || key === 256) state.aesKeyBits = key;
  const tag = Number(p.get("gcmTag"));
  if (tag === 8 || tag === 12 || tag === 16) state.gcmTag = tag;
  const integ = p.get("cbcIntegrity");
  if (integ === "sha256-128" || integ === "sha384-192" || integ === "sha512-256") state.cbcIntegrity = integ;
  state.ueTransmitPacketSize = Math.min(65535, Math.max(minimumUePacketSize(state.ueIp), state.ueTransmitPacketSize));
  return state;
}
