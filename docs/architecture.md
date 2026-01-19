# Architecture & Maturity Model

## 1. Design Philosophy: "Mature, Stateless, Verified"

The architecture is designed to minimize "Trust Assumptions." We assume the network is hostile, the server is liable to compromise, and only the client endpoint is trusted.

## 2. Core Components

### A. Compute Layer (Global Edge)
*   **Technology**: Cloudflare Workers.
*   **Rationale**:
    *   **Statelessness**: No persistent server to hack. Code executes ephemerally at the edge.
    *   **Isolation**: Each request is isolated, preventing cross-request memory leakage.
    *   **Availability**: Deployed to 250+ cities worldwide, ensuring professional-grade availability.

### B. State Management (Atomic Consistency)
*   **Technology**: Cloudflare Durable Objects.
*   **Rationale**:
    *   **Consistency**: Provides strong consistency for "Delivery Status." This prevents race conditions (e.g., checking if a "Burn-on-Read" message has already been read).
    *   **Locking**: Ensures that once a message is marked as "Delivered" or "Expired," the state is irreversibly locked globally.

### C. Cryptographic Core (Verified & Portable)
*   **Technology**: TweetNaCl.js (Port of NaCl).
*   **Rationale**:
    *   **Auditability**: Uses a minimal, high-security code base (XSalsa20-Poly1305).
    *   **Client-Side Execution**: All encryption/decryption occurs within the user's browser memory space.
    *   **Ephemeral Keys**: Keys are generated via `window.crypto.getRandomValues` and exist only as URL fragments.

## 3. The Trustless Data Flow

1.  **Encryption (Browser)**: `Data + Key(random) -> EncryptedBlob + Hash`.
2.  **Transport**: `EncryptedBlob` sent to Worker via TLS 1.3. `Key` remains in URL Fragment.
3.  **Storage**: Worker saves `EncryptedBlob` to R2 (Object Storage).
4.  **Indexing**: Worker saves `Hash` and Metadata to D1 (SQL).
5.  **Anchoring (Optional)**: Worker submits `Hash` to Solana Blockchain for timestamping.
6.  **Retrieval**:
    *   Recipient clicks link `domain.com/pickup#Key`.
    *   Browser requests Blob.
    *   Browser decrypts locally: `Decrypt(EncryptedBlob, Key)`.

## 4. Threat Model & Risk Boundaries

| Threat Vector | Defense Mechanism | Residual Risk |
| :--- | :--- | :--- |
| **Server Compromise** | Zero-Knowledge Encryption. Keys never stored. | Metadata leakage (Sender/Receiver IP). |
| **Database Leak** | Data is encrypted at rest with keys not in DB. | None for content. |
| **Network Snooping** | TLS 1.3 + URL Fragment architecture. | Traffic analysis (timing/size). |
| **Client Device Hack** | Out of Scope. | Keylogger/Screen capture on endpoint. |

## 5. Architectural Maturity Indicators

*   **No Custom Crypto**: We strictly use standard, audited primitives (NaCl).
*   **Serverless Scale**: No servers to patch or maintain.
*   **Global Distribution**: Resilience against regional outages.
*   **Separation of Concerns**: Storage (R2), Metadata (D1), and Logic (Workers) are decoupled.