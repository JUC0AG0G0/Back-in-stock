---
sidebar_position: 2
title: Getting started
---

# Getting started

You need a machine with [Docker](https://docs.docker.com/get-docker/) and Docker Compose: a NAS, a Raspberry Pi 4 or newer, a small server or your own computer.

## One-command install

On macOS or Linux, in a terminal:

```bash
curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.ps1 | iex
```

The script checks that Docker is installed and running, then asks a few questions, each with a suggested value (press Enter to keep it):

| Question           | Suggested value                       |
| ------------------ | ------------------------------------- |
| Install folder     | `~/back-in-stock`                     |
| Web interface port | `8080`, or the next free one if taken |
| Time zone          | Your machine's                        |
| One-click updates  | Yes (as soon as they are available)   |

It then writes `docker-compose.yml` and `.env` in that folder, starts the app, waits until it answers and shows you its address. Settings live in `.env`: edit it, then run `docker compose up -d` to apply them.

Running the same command again **updates** an existing install: your data and your answers are kept.

<details>
<summary>Without questions (scripts, remote servers)</summary>

Answers can come from environment variables: `BIS_DIR`, `BIS_PORT`, `BIS_TZ`, `BIS_VERSION` (default `latest`) and `BIS_UPDATER` (`yes` or `no`).

```bash
curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | BIS_PORT=9000 sh -s -- --yes
```

`install.sh` options: `--yes` (no questions), `--version 0.2.0` (a specific version), `--no-updater` (no one-click updates), `--dir` and `--port`. On Windows, `$env:BIS_YES = '1'` replaces `--yes`.

</details>

Prefer to do it by hand? Follow the steps below.

## 1. Create `docker-compose.yml`

```yaml title="docker-compose.yml"
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:latest
    restart: unless-stopped
    ports:
      - '8080:8080'
    volumes:
      - ./data:/data
    environment:
      TZ: Europe/Paris
```

The `./data` folder holds the whole database (one SQLite file). It is the only folder to back up.

## 2. Start

```bash
docker compose up -d
```

Then open [http://localhost:8080](http://localhost:8080) (or your machine's address on port 8080).

## 3. Check that it works

```bash
curl http://localhost:8080/api/health
# {"status":"ok","version":"0.1.0"}
```

Docker tracks this too: `docker compose ps` shows `healthy` once the app is ready.

## Pick the image version

| Tag      | Content                                                        |
| -------- | -------------------------------------------------------------- |
| `latest` | Latest release.                                                |
| `0.1.0`  | One exact version, never changes.                              |
| `0.1`    | Latest patch release of 0.1 (0.1.0, 0.1.1…).                   |
| `edge`   | Development version, rebuilt on every change. May be unstable. |

Each [release](https://github.com/JUC0AG0G0/Back-in-stock/releases) also ships a `docker-compose.yml` pinned to its version, the list of the image's components (SBOM) and a checksums file. The image exists for `amd64` (PCs, Intel NAS) and `arm64` (Raspberry Pi, Apple Silicon Macs).

## Update

```bash
docker compose pull
docker compose up -d
```

Your data in `./data` is kept, and the database is migrated automatically on startup.

:::info Coming soon
A first-run wizard will help you set up your first notification channel (Telegram or email) and add your first watch. One-click updates from the interface are planned too.
:::
