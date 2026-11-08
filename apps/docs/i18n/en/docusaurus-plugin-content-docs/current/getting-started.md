---
sidebar_position: 2
title: Getting started
---

# Getting started

You need a machine with [Docker](https://docs.docker.com/get-docker/) and Docker Compose: a NAS, a Raspberry Pi 4 or newer, a small server or your own computer.

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

Your data in `./data` is kept, and the database is migrated automatically on startup. The web UI also shows a banner when a new version is out, and can install it in one click: see [Updates](updates.md).

:::info Coming soon
A first-run wizard will help you set up your first notification channel (Telegram or email) and add your first watch.
:::
