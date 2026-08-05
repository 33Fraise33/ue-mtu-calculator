# Technical References

This document describes the byte-level model used by Radio Path MTU Lab. It is a practical calculator model, not a replacement for the applicable standards, vendor implementation documentation, or packet captures.

## Encapsulation model

The calculator treats the UE packet as the innermost packet and applies the selected layers around it:

```text
UE IP packet
  + GTP-U outer IP header
  + UDP header
  + GTP-U header and selected extension fields
  + optional IPsec outer IP header
  + optional NAT-T UDP header
  + ESP header, IV, padding, trailer, and integrity data
```

The selected WAN MTU is the maximum size of the enclosing IP packet. Ethernet framing, FCS, VLAN tags, radio headers, and provider-specific headers are not included.

## GTP-U calculation

The GTP-U transport overhead is:

```text
GTP overhead = outer IP + UDP + GTP-U base + optional fields + extension chain
```

The modeled byte values are:

| Component | IPv4 | IPv6 |
| --- | ---: | ---: |
| Outer IP header | 20 | 40 |
| UDP header | 8 | 8 |
| Mandatory GTP-U base header | 8 | 8 |

The 4G profile uses only the mandatory 8-byte GTP-U header. The 5G profiles add the 4-byte optional-fields block and a selected PDU Session Container or extension chain:

| Profile | Additional extension bytes | Total GTP-U header |
| --- | ---: | ---: |
| 4G Base | 0 | 8 |
| 5G Standard | 4 | 16 |
| 5G QFI with PPI | 8 | 20 |
| 5G with PDCP PDU Number | 8 | 20 |
| 5G with Long PDCP PDU Number | 12 | 24 |
| 5G QoS Monitoring DL | 12 | 24 |
| 5G QoS Monitoring UL | 28 | 40 |
| 5G Custom Extension Chain | user input | 12 + user input |

Custom extension input is constrained to a non-negative multiple of four bytes. This reflects the extension-chain unit used by the model; actual deployment behavior depends on the selected 3GPP extension headers and their contents.

## IPsec ESP calculation

IPsec is modeled as ESP tunnel mode around the complete GTP-U packet. The fixed ESP-related overhead is:

```text
ESP fixed = outer IP + optional NAT-T UDP + ESP header + explicit IV + authentication data
```

The modeled values are:

| Component | AES-CBC | AES-GCM |
| --- | ---: | ---: |
| ESP header | 8 | 8 |
| Explicit IV | 16 | 8 |
| Alignment unit | 16 | 4 |
| Authentication data | selected HMAC ICV | selected GCM tag |

NAT traversal adds an 8-byte UDP header for UDP/4500 when enabled. The AES key size changes cryptographic strength but does not change the modeled per-packet wire overhead.

The packet-size-dependent padding is calculated as:

```text
padding = (alignment - ((UE packet + GTP overhead + 2) mod alignment)) mod alignment
```

The `2` represents the ESP Pad Length and Next Header trailer fields. The modeled maximum alignment padding is 15 bytes for AES-CBC and 3 bytes for AES-GCM.

The total packet size is:

```text
encapsulated packet = UE packet + GTP overhead + ESP fixed + 2 + padding
```

## Maximum UE MTU and MSS

Without IPsec, the maximum UE packet is the WAN MTU minus GTP overhead.

With IPsec, the calculator first reserves the fixed ESP overhead and rounds the available encrypted area down to the cipher alignment unit. It then removes the 2-byte ESP trailer and GTP overhead.

TCP MSS guidance is calculated from the maximum UE MTU:

```text
IPv4 MSS = maximum UE MTU - 40
IPv6 MSS = maximum UE MTU - 60
```

These values subtract the IP and TCP headers only. TCP options, extension headers, tunnel policy, and endpoint-specific behavior may require a lower operational MSS.

The minimum modeled UE transmit packet is 28 bytes for IPv4 and 48 bytes for IPv6: the IP header plus 8 bytes of data. The calculator warns when the resulting IPv6 MTU is below 1280 bytes.

## Scope and limitations

- This is a fixed-header overhead model, not a full packet parser.
- Optional IP extension headers are excluded.
- ESP Traffic Flow Confidentiality padding is excluded.
- Ethernet headers and FCS are excluded.
- VLAN tags are excluded.
- Radio and provider-specific encapsulations are excluded.
- URLLC is not treated as a universal fixed overhead; the QoS Monitoring presets represent selected metadata profiles.
- The calculator does not validate whether a selected combination is enabled by a particular vendor, 3GPP release, security policy, or deployment.
- ECP384 is treated as an IKE key-exchange group and therefore contributes no per-packet overhead.
- Results should be checked against packet captures and implementation documentation before being used for production configuration.

## Standards and source material

- [RFC 3602: The AES-CBC Cipher Algorithm and Its Use with IPsec](https://www.rfc-editor.org/rfc/rfc3602)
- [RFC 3948: UDP Encapsulation of IPsec ESP Packets](https://www.rfc-editor.org/rfc/rfc3948)
- [RFC 4106: The Use of Galois/Counter Mode (GCM) in IPsec ESP](https://www.rfc-editor.org/rfc/rfc4106)
- [RFC 4303: IP Encapsulating Security Payload (ESP)](https://www.rfc-editor.org/rfc/rfc4303)
- [RFC 4868: Using HMAC-SHA-256, HMAC-SHA-384, and HMAC-SHA-512 with IPsec](https://www.rfc-editor.org/rfc/rfc4868)
- [RFC 8200: Internet Protocol, Version 6 (IPv6) Specification](https://www.rfc-editor.org/rfc/rfc8200)
- [3GPP TS 29.281: General Packet Radio Service (GPRS) Tunnelling Protocol User Plane (GTPv1-U)](https://www.3gpp.org/dynareport/29281.htm)

## Licensing note

The project is licensed under [GPL-3.0-or-later](LICENSE). The application source and distributed modified versions are intended to remain available under GPL-compatible terms. Third-party dependencies retain their own licenses; the dependency lockfile is the authoritative package inventory.
