---
sidebar_position: 3
title: Configuration
---

# Configuration

The server is configured with environment variables, in the `environment` section of your `docker-compose.yml`. Everything functional (check frequency, channels, notification rules) will be set from the interface.

| Variable       | Default (Docker) | Purpose                                                                       |
| -------------- | ---------------- | ----------------------------------------------------------------------------- |
| `PORT`         | `8080`           | HTTP port of the server.                                                      |
| `HOST`         | `0.0.0.0`        | Listen address.                                                               |
| `BIS_DATA_DIR` | `/data`          | Folder of the SQLite database (`back-in-stock.db`). Outside Docker: `./data`. |
| `LOG_LEVEL`    | `info`           | `debug`, `info`, `warn` or `error`.                                           |
| `TZ`           | (none)           | Time zone, e.g. `Europe/Paris`, for displayed times and quiet hours.          |

The variables of the new version check and the one-click update (`BIS_UPDATE_CHECK`, `BIS_UPDATE_CHANNEL`, `BIS_UPDATER_URL`) are described in [Updates](updates.md#settings).

## Language

The interface follows your browser's language (English or French, English otherwise). You can change it with the switcher at the top of the screen: your choice is remembered.

## Notifications

For each event type (alerts enabled, back in stock, out of stock, preorder, new item, item removed), a global setting says whether to notify and on which channels. Each watch can override this setting.

| Event          | When                                                           |
| -------------- | -------------------------------------------------------------- |
| Alerts enabled | First successful check of a new watch, with its current state. |
| Back in stock  | The product is available again (confirmed by a second check).  |
| Out of stock   | The product is no longer available.                            |
| Preorder       | The product opens for preorder.                                |
| New item       | An item appears on a listing page.                             |
| Item removed   | An item disappears from a listing page.                        |

A page that cannot be read never changes the state and never triggers a false alert.

:::info Coming soon
The settings screen and the guided Telegram and email setup land with milestone M1.
:::
