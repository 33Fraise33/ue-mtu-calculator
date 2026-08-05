import { describe, expect, it } from "vitest";
import { calculate, DEFAULT_STATE, decodeState, encodeState, getGtpProfileInfo, GTP_PROFILE_INFO, minimumUePacketSize, type CalculatorState } from "./calculator";

const withState = (changes: Partial<CalculatorState>): CalculatorState => ({ ...DEFAULT_STATE, ...changes });

describe("radio path packet model", () => {
  it("uses the requested recommended defaults", () => {
    const result = calculate(DEFAULT_STATE);
    expect(DEFAULT_STATE.transport).toBe("standard");
    expect(DEFAULT_STATE.ipsecEnabled).toBe(true);
    expect(DEFAULT_STATE.cipher).toBe("gcm");
    expect(DEFAULT_STATE.natTraversal).toBe(true);
    expect(DEFAULT_STATE.gtpProfile).toBe("5g-qfi");
    expect(result.gtpOverhead).toBe(44);
    expect(result.maxUeMtu).toBe(1394);
    expect(result.mss).toEqual({ ipv4: 1354, ipv6: 1334 });
    expect(result.encapsulatedPacket).toBe(156);
    expect(result.headroom).toBe(1344);
    expect(result.groups.map((group) => group.id)).toEqual(["ipsec-transport", "esp", "gtp-transport", "gtp-u"]);
    expect(result.groups.reduce((sum, group) => sum + group.bytes, 0)).toBe(result.totalOverhead);
  });

  it("accounts for standard 5G optional fields and PDU Session Container", () => {
    const result = calculate(withState({ ipsecEnabled: false }));
    expect(result.gtpOverhead).toBe(44);
    expect(result.maxUeMtu).toBe(1456);
  });

  it("keeps 4G at the base GTP-U overhead", () => {
    const result = calculate(withState({ ipsecEnabled: false, gtpProfile: "4g" }));
    expect(result.gtpOverhead).toBe(36);
    expect(result.maxUeMtu).toBe(1464);
  });

  it("ignores NAT-T when the IPsec layer is disabled", () => {
    const result = calculate(withState({ ipsecEnabled: false, natTraversal: true }));
    expect(result.ipsecOverhead).toBe(0);
    expect(result.warnings).not.toContain("NAT traversal requires IPsec to be enabled.");
  });

  it("adds custom GTP-U extension bytes in four-byte units", () => {
    const result = calculate(withState({ ipsecEnabled: false, gtpProfile: "5g-custom", gtpCustomExtension: 12 }));
    expect(result.gtpOverhead).toBe(52);
    expect(result.rows.find((row) => row.id === "gtp-psc")?.bytes).toBe(12);
  });

  it("matches RFC-style CBC tunnel arithmetic with exact block padding", () => {
    const state = withState({ cipher: "cbc", cbcIntegrity: "sha256-128", ueTransmitPacketSize: 1280 });
    const result = calculate(state);
    // GTP 44 + outer IP 20 + NAT-T 8 + ESP 8 + IV 16 + trailer 2 + ICV 16 + pad 2.
    expect(result.configuredPadding).toBe(2);
    expect(result.totalOverhead).toBe(116);
    expect(result.maxUeMtu).toBe(1378);
  });

  it("matches GCM ESP IV, tag, and four-byte alignment arithmetic", () => {
    const result = calculate(withState({ gtpProfile: "4g", ueTransmitPacketSize: 1280 }));
    // GTP 36 + IPsec fixed 60 + trailer 2 + GCM pad 2.
    expect(result.configuredPadding).toBe(2);
    expect(result.totalOverhead).toBe(100);
    expect(result.maxUeMtu).toBe(1402);
  });

  it("changes CBC overhead and maximum MTU at the correct block boundaries", () => {
    const expected = [
      ["sha256-128", 16, 1378],
      ["sha384-192", 24, 1378],
      ["sha512-256", 32, 1362],
    ] as const;
    for (const [cbcIntegrity, icvBytes, maxUeMtu] of expected) {
      const result = calculate(withState({ cipher: "cbc", cbcIntegrity, ueTransmitPacketSize: 1280 }));
      expect(result.rows.find((row) => row.id === "esp-auth")?.bytes).toBe(icvBytes);
      expect(result.maxUeMtu).toBe(maxUeMtu);
    }
  });

  it("changes GCM overhead and maximum MTU for every supported tag size", () => {
    const expected = [
      [8, 8, 1402],
      [12, 12, 1398],
      [16, 16, 1394],
    ] as const;
    for (const [gcmTag, tagBytes, maxUeMtu] of expected) {
      const result = calculate(withState({ cipher: "gcm", gcmTag, ueTransmitPacketSize: 1280 }));
      expect(result.rows.find((row) => row.id === "esp-auth")?.bytes).toBe(tagBytes);
      expect(result.maxUeMtu).toBe(maxUeMtu);
    }
  });

  it("changes IPsec outer and GTP transport overhead independently", () => {
    const result = calculate(withState({ gtpIp: "IPv6", ipsecIp: "IPv6", gtpProfile: "4g", cipher: "cbc" }));
    expect(result.gtpOverhead).toBe(56);
    expect(result.maxUeMtu).toBe(1350);
    expect(result.rows.find((row) => row.id === "gtp-ip")?.bytes).toBe(40);
    expect(result.rows.find((row) => row.id === "ipsec-ip")?.bytes).toBe(40);
  });

  it("uses the PPPoE MTU without changing encapsulation bytes", () => {
    const result = calculate(withState({ transport: "pppoe", gtpProfile: "4g", ipsecEnabled: false }));
    expect(result.wanMtu).toBe(1492);
    expect(result.gtpOverhead).toBe(36);
    expect(result.maxUeMtu).toBe(1456);
  });

  it("fails visibly for invalid custom extensions", () => {
    const result = calculate(withState({ gtpProfile: "5g-custom", gtpCustomExtension: 3 }));
    expect(result.warnings).toContain("Custom GTP-U extension bytes must be a non-negative multiple of 4.");
  });

  it("uses logical IP packet minimums", () => {
    expect(minimumUePacketSize("IPv4")).toBe(28);
    expect(minimumUePacketSize("IPv6")).toBe(48);
    expect(DEFAULT_STATE.ueTransmitPacketSize).toBe(48);
  });

  it("supports standardized 5G extension profiles", () => {
    const profiles: Array<[CalculatorState["gtpProfile"], number]> = [
      ["5g-qfi", 44], ["5g-qfi-ppi", 48], ["5g-pdcp", 48], ["5g-long-pdcp", 52], ["5g-qos-dl", 52], ["5g-qos-ul", 68],
    ];
    for (const [gtpProfile, expected] of profiles) expect(calculate(withState({ ipsecEnabled: false, gtpProfile })).gtpOverhead).toBe(expected);
  });

  it("keeps profile help metadata aligned with calculated GTP-U totals", () => {
    expect(GTP_PROFILE_INFO["5g-qfi"].label).toBe("5G Standard");
    for (const [gtpProfile] of [["4g"], ["5g-qfi"], ["5g-qfi-ppi"], ["5g-pdcp"], ["5g-long-pdcp"], ["5g-qos-dl"], ["5g-qos-ul"]] as const) {
      const info = getGtpProfileInfo(gtpProfile);
      const result = calculate(withState({ ipsecEnabled: false, gtpProfile }));
      expect(info.extensionBytes).toBe(result.gtpOverhead - 20 - 8 - 8 - (gtpProfile === "4g" ? 0 : 4));
      expect(info.description.length).toBeGreaterThan(20);
    }
    expect(getGtpProfileInfo("5g-custom", 12).extensionBytes).toBe(12);
  });

  it("reports the exact and maximum automatic alignment padding", () => {
    const gcm = calculate(withState({ ueTransmitPacketSize: 1280 }));
    const cbc = calculate(withState({ cipher: "cbc", ueTransmitPacketSize: 1280 }));
    expect(gcm.maximumAlignmentPadding).toBe(3);
    expect(cbc.maximumAlignmentPadding).toBe(15);
    expect(gcm.worstCaseOverhead - gcm.totalOverhead).toBe(1);
    expect(cbc.worstCaseOverhead - cbc.totalOverhead).toBe(13);
  });

  it("encodes and decodes shareable URL state", () => {
    const state = withState({ transport: "jumbo", cipher: "cbc", ipsecIp: "IPv6", ueTransmitPacketSize: 1500, gtpCustomExtension: 8, gtpProfile: "5g-custom" });
    expect(decodeState(`?${encodeState(state)}`)).toEqual(state);
  });
});

describe("maximum-MTU boundary", () => {
  it("never returns a maximum packet that exceeds the WAN MTU", () => {
    const mtus = [1492, 1500, 9000] as const;
    const ips = ["IPv4", "IPv6"] as const;
    for (const transport of ["standard", "pppoe", "jumbo"] as const) {
      for (const gtpIp of ips) for (const ipsecIp of ips) for (const cipher of ["gcm", "cbc"] as const) {
        const result = calculate(withState({ transport, gtpIp, ipsecIp, cipher, ueTransmitPacketSize: 0 }));
        expect(result.wanMtu).toBe(mtus[transport === "standard" ? 1 : transport === "pppoe" ? 0 : 2]);
        const atMax = calculate(withState({ transport, gtpIp, ipsecIp, cipher, ueTransmitPacketSize: result.maxUeMtu }));
        expect(atMax.encapsulatedPacket).toBeLessThanOrEqual(result.wanMtu);
        const above = calculate(withState({ transport, gtpIp, ipsecIp, cipher, ueTransmitPacketSize: result.maxUeMtu + 1 }));
        expect(above.encapsulatedPacket).toBeGreaterThan(result.wanMtu);
      }
    }
  });

  it("passes the maximum boundary for every supported profile and crypto combination", () => {
    const profiles: Array<[CalculatorState["gtpProfile"], number]> = [
      ["4g", 0], ["5g-qfi", 0], ["5g-qfi-ppi", 0], ["5g-pdcp", 0],
      ["5g-long-pdcp", 0], ["5g-qos-dl", 0], ["5g-qos-ul", 0], ["5g-custom", 8],
    ];
    const mtus = ["standard", "pppoe", "jumbo"] as const;
    const ips = ["IPv4", "IPv6"] as const;
    const cbcs = ["sha256-128", "sha384-192", "sha512-256"] as const;
    const tags = [8, 12, 16] as const;
    for (const [gtpProfile, gtpCustomExtension] of profiles) {
      for (const transport of mtus) for (const gtpIp of ips) for (const ipsecIp of ips) for (const natTraversal of [false, true]) {
        for (const cbcIntegrity of cbcs) {
          const base = withState({ transport, gtpProfile, gtpCustomExtension, gtpIp, ipsecIp, natTraversal, cipher: "cbc", cbcIntegrity, ipsecEnabled: true, ueTransmitPacketSize: 48 });
          const result = calculate(base);
          expect(calculate({ ...base, ueTransmitPacketSize: result.maxUeMtu }).encapsulatedPacket).toBeLessThanOrEqual(result.wanMtu);
          expect(calculate({ ...base, ueTransmitPacketSize: result.maxUeMtu + 1 }).encapsulatedPacket).toBeGreaterThan(result.wanMtu);
        }
        for (const gcmTag of tags) {
          const base = withState({ transport, gtpProfile, gtpCustomExtension, gtpIp, ipsecIp, natTraversal, cipher: "gcm", gcmTag, ipsecEnabled: true, ueTransmitPacketSize: 48 });
          const result = calculate(base);
          expect(calculate({ ...base, ueTransmitPacketSize: result.maxUeMtu }).encapsulatedPacket).toBeLessThanOrEqual(result.wanMtu);
          expect(calculate({ ...base, ueTransmitPacketSize: result.maxUeMtu + 1 }).encapsulatedPacket).toBeGreaterThan(result.wanMtu);
        }
      }
    }
  });
});
