---
sidebar_position: 4
title: Updates
---

# Updates

Back in stock ! tells you when a new version is out, and can install it in one click from the web UI. Your data is always kept.

## The "New version available" banner

When a version newer than yours is published, a banner shows at the top of every page: "Version 1.4.0 is available (you have 1.3.2)".

- **What's new** opens the changelog of every version between yours and the latest, taken from the [GitHub release notes](https://github.com/JUC0AG0G0/Back-in-stock/releases).
- **Install** starts the one-click update when the `updater` service is installed (see below). Otherwise it shows the commands to run.
- **Later** hides the banner until the next version (remembered in your browser).

When one of the versions has **breaking changes**, the banner is orange and links to the [migration guide](#migration) before installing.

### Where the information comes from

The server asks the GitHub Releases API (`api.github.com/repos/JUC0AG0G0/Back-in-stock/releases`) **every 6 hours** by default, with no account or token. It sends the `If-None-Match` header: when nothing changed, GitHub answers "304" and nothing is downloaded.

This is the app's **only outgoing request** besides the sites you watch and your notification channels. It sends nothing about you, apart from your IP address and the installed version (in the `User-Agent` header).

Only **published images** check for updates (`latest`, `1`, `1.4`, `1.4.2`…). `edge` images and local builds never do.

### Settings {#settings}

Everything can be set from the **Settings** screen of the UI: a **Check now** button, automatic checks on or off, frequency (1 to 168 hours) and the versions offered. The environment variables below give the defaults; a value saved in the UI replaces them, without a restart, until you click "Back to the default".

| Variable              | Default  | Purpose                                                              |
| --------------------- | -------- | -------------------------------------------------------------------- |
| `BIS_UPDATE_CHECK`    | `true`   | `false` turns the check off completely (no GitHub request at all).   |
| `BIS_UPDATE_CHANNEL`  | `stable` | `prerelease` also offers pre-releases (`-rc`, `-beta`).              |
| `BIS_UPDATE_INTERVAL` | `6`      | Hours between two checks, 1 to 168.                                  |
| `BIS_UPDATER_URL`     | (none)   | Address of the `updater` service, for example `http://updater:8090`. |

## One-click update

A container cannot replace itself. The one-click update therefore goes through a **small optional companion service**, `updater`, in the same `docker-compose.yml`. The [install script](getting-started.md) offers to add it. To add it by hand:

```yaml title="docker-compose.yml"
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:${BIS_IMAGE_TAG:-latest}
    # ... the rest of your configuration
    environment:
      BIS_UPDATER_URL: http://updater:8090

  updater:
    image: ghcr.io/juc0ag0g0/back-in-stock-updater:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data # the same data folder as the app
      - .:/install # to update BIS_IMAGE_TAG in .env
    environment:
      BIS_TARGET_SERVICE: back-in-stock
```

Then `docker compose up -d`.

### What happens when you click "Install"

1. The app asks the `updater` for the update, with a secret token created on first start in `data/updater.token`.
2. The `updater` **downloads the new image** while the app keeps running (the `slim` or `full` variant is kept).
3. It **stops the app cleanly** and **backs up the database** to `data/backups/db-<version>-<date>.sqlite`.
4. It **re-creates the container** with exactly the same configuration: volumes, ports, variables, networks. Only the image and what it defines (version, command) change.
5. The new version starts and applies its migrations. The `updater` waits for the **healthcheck** to pass.
6. If it does not start properly, it **rolls back automatically**: it puts the old container back and restores the database backup.

Meanwhile the web UI shows each step, then reloads by itself on the new version with an "Update complete" message. If it fails, it shows the reason and that the previous version was put back.

### Image tag and the `.env` file

| `BIS_IMAGE_TAG` in `.env` | Behaviour                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `latest` (default)        | The `updater` pulls `latest` again. Nothing else to change.                                                                                                                                        |
| `1` or `1.4`              | Same, as long as the new version stays in that series (a 2.0 will not be under the `1` tag).                                                                                                       |
| `1.4.2` (exact version)   | The `updater` moves to the new version's tag and rewrites **only** the `BIS_IMAGE_TAG` line of `.env`, so a later `docker compose up -d` keeps the new version. This needs the `.:/install` mount. |
| `edge`                    | No one-click update: it is not a published version.                                                                                                                                                |

### Security: the trade-off

:::warning Access to the Docker socket
Mounting `/var/run/docker.sock` gives the `updater` **full control of Docker on the machine**, which in practice equals root access. Read what follows before turning it on.
:::

What limits the risk:

- The `updater` is **separate** from the app: the app, which reads external web pages, never has access to the socket.
- It **publishes no port**: only the app can reach it, on the internal Docker Compose network.
- Every call needs the **secret token** from `data/updater.token` (readable by the app only).
- It does **one thing**: replace the `back-in-stock` container with a **published, newer** version announced by GitHub. It refuses other tags, and the app refuses to ask for a version that is not in the list of updates.
- Its code is short and has no dependency: [`apps/updater`](https://github.com/JUC0AG0G0/Back-in-stock/tree/main/apps/updater).

What remains true: until the web UI has authentication (planned for milestone M3), **anyone who can open the web UI can start an update** to a published version. Do not expose the web UI on the Internet without protection.

If you prefer not to grant this access, do not install the `updater`: the banner stays, and **Install** simply shows the commands to run.

## Updating by hand

In the folder that holds your `docker-compose.yml`:

```bash
docker compose pull
docker compose up -d
```

If `BIS_IMAGE_TAG` is an exact version in `.env`, change it to the new one first. Your data in `./data` is kept and the database is migrated on start.

### With an automatic update tool

You can also leave updates to a tool that watches images, such as [Watchtower](https://containrrr.dev/watchtower/) or [Diun](https://crazymax.dev/diun/) (which notifies without updating). They need the same access to the Docker socket, take no database backup, do not roll back, and do not know when a version has breaking changes. In that case set `BIS_UPDATE_CHECK=false` so you do not get the banner twice.

## Going back to the previous version {#rollback}

If something is wrong after a successful update:

1. Stop the app: `docker compose stop back-in-stock`.
2. Restore the backup: copy `data/backups/db-<old version>-<date>.sqlite` over `data/back-in-stock.db`, and delete `data/back-in-stock.db-wal` and `data/back-in-stock.db-shm` if they exist.
3. Put the old version in `.env` (`BIS_IMAGE_TAG=1.3.2`), then `docker compose up -d`.

Backups are never deleted automatically: clean up `data/backups` from time to time.

## Migration guide {#migration}

Breaking changes are listed at the top of each version's release notes, in the "⚠ BREAKING CHANGES" section. Read them before installing: they say what to adapt (renamed variable, plugin to update…).

No published version has breaking changes yet.
