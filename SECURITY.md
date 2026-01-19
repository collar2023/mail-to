# Security Policy

## Core Security Stance

We strictly adhere to a **"Trust No One" (Zero Trust)** architecture.
*   **We do not store your keys.**
*   **We do not see your data.**
*   **We cannot recover lost passwords/links.**

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **DO NOT** create a public issue.

1.  **Email**: Send details to `security@460001.xyz` (or the maintainer's email listed in package.json).
2.  **Encryption**: Please use PGP if possible (Key ID provided upon request).
3.  **Timeline**: We strive to acknowledge reports within 48 hours and provide a fix timeline within 1 week.

## Scope & Boundaries

### In Scope
*   **Client-Side Leakage**: Any bug that causes the private key (URL fragment) to be sent to the server.
*   **Broken Cryptography**: Implementation errors in the NaCl/XSalsa20 usage.
*   **Access Control**: Unauthorized ability to delete or overwrite another user's encrypted blobs.
*   **XSS/Injection**: Vulnerabilities allowing malicious scripts to execute in the context of the application.

### Out of Scope
*   **Phishing**: Social engineering attacks where a user is tricked into giving away their link.
*   **Device Compromise**: If the user's device has malware (keyloggers), we cannot protect against that.
*   **Metadata Visibility**: We acknowledge that the *server* knows Sender IP, Recipient IP (on fetch), and file size. This is a trade-off for usability (notification delivery). Use Tor/VPN if metadata privacy is critical.

## Cryptographic Implementation details

*   **Algorithm**: [TweetNaCl.js](https://tweetnacl.js.org/)
*   **Encryption**: `nacl.secretbox` (XSalsa20 stream cipher + Poly1305 MAC).
*   **Key Exchange**: Ephemeral keys generated via `nacl.randomBytes`.
*   **Hashing**: SHA-256 for integrity verification and blockchain anchoring.
