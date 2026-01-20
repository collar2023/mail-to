# Open-source Digital Trust Delivery System

> **Secure, verifiable, and end-to-end encrypted information distribution protocol.**
>
> *High-integrity infrastructure for sensitive communication, digital provenance, and proof-of-delivery.*

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Architecture](https://img.shields.io/badge/Architecture-Zero--Knowledge-green)
![Security](https://img.shields.io/badge/Security-High--Integrity-blue)

## 💎 Core Value & Market Scarcity

Mail-To addresses a critical gap in digital communication: the ability to prove delivery and integrity without sacrificing privacy or relying on centralized trust.

> **"How do you mathematically verify: 'I sent it', 'You received it', and 'The content is exactly as intended'?"**

We achieve this through a unique architectural combination:

1.  **Zero-Knowledge Privacy**: Content is encrypted on the client; the infrastructure provider never has access to the keys or plaintext.
2.  **Self-Hostable Sovereignty**: Users retain absolute control over their communication nodes and data governance.
3.  **Cryptographic Proof (Optional)**: Anchoring hashes to a public ledger (Solana) provides a neutral, third-party verifiable timestamp of existence and integrity.

This is a **High-Integrity Communication Protocol** designed for:
*   **Official Notifications**: Verifiable delivery of notices, alerts, and instructions.
*   **Compliance & Audit**: Maintaining a tamper-proof trail of sensitive data transfers.
*   **Digital Provenance**: Anchoring original work and IP before external disclosure.

---

## 📚 Documentation & Scenarios

*   **[Use Cases: Verifiable Delivery & Compliance](docs/use-cases.md)**
    *   📡 **Official Notifications**: Reliable delivery with cryptographic receipts.
    *   🛡️ **Provenance & Rights**: Establishing "Priority of Existence" for digital assets.
    *   🏢 **Compliance & Control**: Secure, audit-ready transmission of sensitive credentials.
*   **[Architecture & Trust Model](docs/architecture.md)**: How the Zero-Knowledge engine ensures trustless operation.
*   **[Security Policy](SECURITY.md)**: Threat modeling and security boundaries.

---

## 🏗️ Architecture Maturity

*   **Global Edge**: Powered by Cloudflare Workers for low-latency, stateless execution.
*   **Atomic Consistency**: Durable Objects manage delivery state to prevent race conditions.
*   **Standard Crypto**: Built on TweetNaCl (XSalsa20-Poly1305) for audited, high-speed encryption.

## 🚀 Getting Started (Self-Hosting)

**Prerequisites**: Node.js (v18+), Cloudflare Account, Wrangler CLI.

### Installation

1.  **Clone**
    ```bash
    git clone https://github.com/collar2023/mail-to.git
    cd mail-to/opensource_release
    ```

2.  **Install**
    ```bash
    npm install
    ```

3.  **Configure**
    *   `npx wrangler login`
    *   `npx wrangler d1 create lawyer-db`
    *   `npx wrangler r2 bucket create mail-to-ui-assets`
    *   `npx wrangler r2 bucket create mail-to-payloads`
    *   **Update `wrangler.toml`** with your resource IDs.

4.  **Deploy**
    ```bash
    npm run deploy
    ```

## 🤝 Commercial & Managed Services

For organizations requiring managed infrastructure, SLAs, and enterprise-grade support:

*   **SaaS Hosting**: Use our globally optimized nodes with 99.9% uptime.
*   **Advanced Analytics**: Visualized delivery and access audit trails.
*   **Enterprise Branding**: Fully customizable white-label solutions.

[Contact Us for Licensing & Services](mailto:8188019@gmail.com)

## 📄 License

**AGPL-3.0**: Open Source & Copyleft. You are free to use and modify. However, if you provide this software as a service over a network, you **must** release your source code under the same license. For proprietary use cases or managed hosting, a commercial license is required.
