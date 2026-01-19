# mail-to: Secure Digital Information Delivery System

> **Privacy-First. End-to-End Encrypted. Self-Hostable.**
>
> Open source version of the `mail-to` protocol.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)

## Overview

`mail-to` is a secure digital delivery system designed to ensure that your message reaches *only* the intended recipient. Built on Cloudflare Workers, D1, and R2, it combines the scalability of serverless architecture with the privacy of client-side encryption.

This repository contains the **Community Edition** source code. It is designed for individuals who demand absolute control over their data and wish to self-host the entire infrastructure.

## Features

*   **Zero-Knowledge Architecture**: The server (Cloudflare Worker) never sees the unencrypted content of your messages.
*   **Blockchain Evidence**: Integration with Solana for immutable proof of delivery (optional).
*   **Serverless**: Powered by Cloudflare Workers for low latency and high availability.
*   **Self-Hostable**: You own the infrastructure.

## Architecture

*   **Frontend**: React + Vite (Single Page Application)
*   **Backend**: Cloudflare Workers (Edge Compute)
*   **Storage**:
    *   **Cloudflare D1** (SQLite): Metadata and status tracking.
    *   **Cloudflare R2** (Object Storage): Encrypted payloads and assets.
*   **Durability**: Cloudflare Durable Objects for consistent state management.

## Getting Started (Self-Hosting)

### Prerequisites

1.  Node.js (v18+) and npm
2.  Cloudflare Account (Free tier works for personal use)
3.  [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally.

### Installation

1.  Clone this repository:
    ```bash
    git clone https://github.com/collar2023/mail-to.git
    cd mail-to
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Cloudflare Resources:
    *   Create a D1 database: `npx wrangler d1 create lawyer-db`
    *   Create R2 buckets: `mail-to-ui-assets` and `mail-to-payloads`
    *   Update `wrangler.toml` with your new IDs.

4.  Deploy:
    ```bash
    npm run deploy
    ```

## Development

Run the local development server:

```bash
npm run dev
```

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

*   **Freedom**: You are free to use, modify, and distribute this software.
*   **Community**: If you modify this software and provide it as a service over a network (SaaS), you **must** release your source code under the same license.

See [LICENSE](LICENSE) for details.

## Commercial Licensing

For enterprise use cases, custom integrations, or managed hosting without the AGPL copyleft requirements, please contact us for a commercial license.
