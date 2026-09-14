# Radio Path MTU Calculator

Radio Path MTU Calculator is a browser-based calculator for understanding how much usable packet space remains after a UE packet crosses a mobile transport path. It is intended to make every encapsulation layer visible instead of hiding the result behind a single MTU number.

Created by [Unitix](https://unitix.be).

The project aims to help mobile-network engineers, packet-troubleshooters, and learners answer questions such as:

- How much GTP-U, UDP, and outer-IP overhead does a 4G or 5G path add?
- How do IPsec ESP tunnel mode, NAT traversal, cipher choice, authentication tags, and alignment padding change the result?
- What is the largest UE packet that fits inside a selected WAN MTU?
- What TCP MSS guidance follows from that calculated UE MTU?

The modeled path is:

`UE IP packet -> GTP-U/UDP/IP -> optional IPsec tunnel and NAT traversal -> WAN MTU`

## AI disclosure and contributions

This project was created completely with the help of AI and would not have been possible without it. The implementation, calculations, documentation, and presentation should be treated as work that benefits from expert review rather than as authoritative network or security guidance.

If you find a mistake, incorrect standards interpretation, missing edge case, or useful improvement, please open an issue. Include the relevant configuration, expected result, and supporting reference when possible.

## Run with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine with Docker Compose v2. Node.js and npm run inside the container; no host installation is required.

```sh
docker compose run --rm app npm ci
docker compose up
```

Open `http://localhost:5173` in a browser. Stop the development server with `Ctrl+C`.

The source directory is mounted into the container and dependencies are stored in a Docker-managed volume. After changing `package.json` or `package-lock.json`, rerun `docker compose run --rm app npm ci`.

`docker compose run --rm app npm run build` produces the GitHub Pages-ready `dist/` directory in the project folder.

The page includes one randomly selected joke from the locally bundled, MIT-licensed [Official Joke API dataset](https://github.com/15Dkatz/official_joke_api). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and the pinned source revision.

Available container commands:

- `docker compose up` starts the Vite development server at `http://localhost:5173`.
- `docker compose run --rm app npm test` runs the test suite once.
- `docker compose run --rm app npm run test:watch` runs Vitest in watch mode.
- `docker compose run --rm app npm run build` type-checks and builds the application.
- `docker compose run --rm --service-ports app npm run preview -- --host 0.0.0.0` serves the production build at `http://localhost:4173`.
- `docker compose run --rm app npm audit --audit-level=low` checks dependencies for known vulnerabilities.
- `docker compose down -v` stops the containers and removes the dependency volume; run `docker compose run --rm app npm ci` before starting again.

## GitHub Pages

1. Push this folder to a repository with the included files.
2. In repository settings, set Pages to **GitHub Actions**.
3. Push to `main`; `.github/workflows/deploy-pages.yml` runs tests, builds, and deploys.

The Vite base path is relative, so the app works under both a user site and a project site.

## Model

- WAN presets are 1500 byte Standard Ethernet, 1492 byte PPPoE, and 9000 byte Jumbo Frames.
- 4G GTP-U uses IPv4 or IPv6 outer IP, UDP, and the 8 byte mandatory GTP-U header.
- 5G Standard includes the 4 byte GTP-U optional fields block and a minimum 4 byte PDU Session Container.
- 5G profiles include Basic QFI, QFI with PPI, PDCP PDU Number, Long PDCP PDU Number, DL and UL QoS Monitoring timestamp profiles, and a custom extension chain.
- IPsec is ESP tunnel mode. CBC uses a 16 byte explicit IV and 16 byte AES alignment. GCM uses an 8 byte explicit IV, the selected tag length, and 4 byte ESP alignment.
- NAT-T adds UDP/4500 only when enabled.
- AES CBC and AES GCM alignment padding is calculated automatically. The exact selected padding and maximum alignment range are shown separately.
- The UE transmit packet minimum is 28 bytes for IPv4 or 48 bytes for IPv6, representing the IP header plus 8 bytes of data.
- ECP384 is an IKE key-exchange group and has no per-packet overhead.
- TCP MSS guidance is maximum UE MTU minus 40 bytes for IPv4 or 60 bytes for IPv6.
- The calculator excludes Ethernet headers/FCS, VLAN tags, radio headers, and provider-specific encapsulations.

The IPsec arithmetic follows RFC 3602, RFC 3948, RFC 4106, RFC 4303, RFC 4868, and RFC 8200. GTP-U assumptions follow 3GPP TS 29.281. URLLC is not treated as a fixed overhead because its QoS monitoring metadata is conditional and variable; the QoS Monitoring presets represent concrete standardized metadata sizes. Optional IP extension headers and ESP Traffic Flow Confidentiality padding are outside scope.

See [references.md](references.md) for the packet equations, byte-level assumptions, standards links, and known limitations behind the calculator.

## Security and dependencies

Dependencies are locked in `package-lock.json` and installed in CI with `npm ci`. GitHub Actions runs a scheduled npm audit; Dependabot checks for dependency and Actions updates. Use the Docker audit command above for the equivalent local check.

Report security issues privately through the repository's security reporting process rather than opening a public issue.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Created by [Unitix](https://unitix.be), 2026.
