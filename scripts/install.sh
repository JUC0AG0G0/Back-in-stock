#!/bin/sh
# Back in stock ! installer for macOS and Linux.
#
#   curl -fsSL https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.sh | sh
#
# Checks Docker, asks a few questions (folder, port, time zone, one-click updates), writes a
# docker-compose.yml and its .env, starts the app and waits until it answers. Running it again
# updates an existing install to the latest image, keeping its data and its answers as defaults.
#
# Options:   -y, --yes          no questions: defaults, or the BIS_* variables below
#            --version X.Y.Z    pin an image version instead of latest (X.Y follows its fixes)
#            --dir PATH, --port N   same as BIS_DIR and BIS_PORT
#            --no-updater       do not add the one-click update service
# Variables: BIS_DIR (install folder), BIS_PORT, BIS_TZ, BIS_VERSION, BIS_UPDATER (yes or no),
#            BIS_LANG (fr or en, default from the locale).
# For tests: BIS_SKIP_PULL=1 uses the images already present locally.
#
# POSIX sh on purpose: it runs as-is on macOS, Debian/Ubuntu (dash), Alpine (busybox)…

set -eu

UPDATER_IMAGE="ghcr.io/juc0ag0g0/back-in-stock-updater:latest"
HEALTH_TIMEOUT=120

# ---------- messages ----------

case "${BIS_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}}" in
  fr*) FR=1 ;;
  *) FR=0 ;;
esac

# t "texte français" "English text"
t() { if [ "$FR" = 1 ]; then printf '%s' "$1"; else printf '%s' "$2"; fi; }

if [ -t 1 ]; then
  BOLD=$(printf '\033[1m') GREEN=$(printf '\033[32m') YELLOW=$(printf '\033[33m')
  RED=$(printf '\033[31m') RESET=$(printf '\033[0m')
else
  BOLD="" GREEN="" YELLOW="" RED="" RESET=""
fi

step() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$1"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1" >&2; }
die() {
  printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2
  [ -z "${2:-}" ] || printf '  %s\n' "$2" >&2
  exit 1
}

# ---------- questions ----------

ASSUME_YES=0
VERSION=${BIS_VERSION:-}
UPDATER=${BIS_UPDATER:-}
while [ $# -gt 0 ]; do
  case "$1" in
    -y | --yes) ASSUME_YES=1 ;;
    --version)
      [ $# -ge 2 ] || die "$(t "--version attend un numéro de version." "--version needs a version number.")"
      VERSION=$2
      shift
      ;;
    --version=*) VERSION=${1#--version=} ;;
    --dir | --port)
      [ $# -ge 2 ] || die "$(t "$1 attend une valeur." "$1 needs a value.")"
      if [ "$1" = --dir ]; then BIS_DIR=$2; else BIS_PORT=$2; fi
      shift
      ;;
    --dir=*) BIS_DIR=${1#--dir=} ;;
    --port=*) BIS_PORT=${1#--port=} ;;
    --no-updater) UPDATER=no ;;
    -h | --help)
      sed -n '2,20p' "$0" 2> /dev/null | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "$(t "Option inconnue : $1" "Unknown option: $1")" ;;
  esac
  shift
done
VERSION=${VERSION#v}
case "$VERSION" in
  "") VERSION=latest ;;
  *[!0-9A-Za-z._-]*) die "$(t "Version invalide : $VERSION" "Invalid version: $VERSION")" ;;
esac

# With `curl … | sh`, stdin is the script itself: questions are read from the terminal.
INTERACTIVE=1
if [ "$ASSUME_YES" = 1 ] || ! { : < /dev/tty; } 2> /dev/null; then INTERACTIVE=0; fi

# ask "question" "default" → $REPLY
ask() {
  REPLY=""
  if [ "$INTERACTIVE" = 1 ]; then
    printf '  %s %s[%s]%s ' "$1" "$BOLD" "$2" "$RESET" > /dev/tty
    IFS= read -r REPLY < /dev/tty || REPLY=""
  fi
  [ -n "$REPLY" ] || REPLY=$2
}

# confirm "question" → 0 for yes (the default)
confirm() {
  [ "$INTERACTIVE" = 1 ] || return 0
  printf '  %s %s[%s]%s ' "$1" "$BOLD" "$(t "O/n" "Y/n")" "$RESET" > /dev/tty
  IFS= read -r answer < /dev/tty || answer=""
  case "$answer" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# ---------- helpers ----------

has() { command -v "$1" > /dev/null 2>&1; }

compose() {
  if [ "$COMPOSE" = plugin ]; then docker compose "$@"; else docker-compose "$@"; fi
}

valid_port() {
  case "$1" in '' | *[!0-9]*) return 1 ;; esac
  [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

# Something already listens on this port (best effort: ss, nc or lsof, whichever exists).
port_busy() {
  if has ss; then
    ss -ltnH 2> /dev/null | awk '{print $4}' | grep -q "[:.]$1\$"
  elif has nc; then
    nc -z 127.0.0.1 "$1" > /dev/null 2>&1
  elif has lsof; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN > /dev/null 2>&1
  else
    return 1
  fi
}

# The port is held by this very install (re-run to update): not a conflict.
port_is_ours() {
  docker ps --filter "publish=$1" --format '{{.Label "com.docker.compose.project.working_dir"}}' 2> /dev/null |
    grep -qxF "$DIR"
}

detect_tz() {
  case "${TZ:-}" in
    */*) echo "$TZ" && return ;;
  esac
  if [ -r /etc/timezone ]; then
    head -n 1 /etc/timezone && return
  fi
  link=$(readlink /etc/localtime 2> /dev/null || true)
  case "$link" in
    *zoneinfo/*) echo "${link##*zoneinfo/}" && return ;;
  esac
  echo "Europe/Paris"
}

lan_ip() {
  if has ipconfig; then
    ipconfig getifaddr en0 2> /dev/null || ipconfig getifaddr en1 2> /dev/null || true
  elif has hostname; then
    hostname -I 2> /dev/null | awk '{print $1}' || true
  fi
}

# ---------- 1. prerequisites ----------

printf '\n%s🔔 Back in stock !%s %s\n\n' "$BOLD" "$RESET" "$(t "installation" "installer")"
step "$(t "Vérification des prérequis" "Checking requirements")"

has curl || die "$(t "curl est introuvable." "curl was not found.")" \
  "$(t "Installe-le puis relance cette commande." "Install it, then run this command again.")"

OS=$(uname -s)
if ! has docker; then
  if [ "$OS" = Darwin ]; then
    hint="https://docs.docker.com/desktop/setup/install/mac-install/"
  else
    hint="https://docs.docker.com/engine/install/ $(t "(ou : curl -fsSL https://get.docker.com | sh)" "(or: curl -fsSL https://get.docker.com | sh)")"
  fi
  die "$(t "Docker n'est pas installé." "Docker is not installed.")" \
    "$(t "Installe-le d'abord :" "Install it first:") $hint"
fi
ok "Docker $(docker version --format '{{.Client.Version}}' 2> /dev/null || echo '?')"

if ! info=$(docker info 2>&1); then
  case "$info" in
    *"permission denied"*)
      die "$(t "Docker refuse l'accès à ton utilisateur." "Docker denies access to your user.")" \
        "$(t "Ajoute-le au groupe docker (sudo usermod -aG docker \$USER, puis reconnecte-toi) ou relance avec sudo." \
          "Add it to the docker group (sudo usermod -aG docker \$USER, then log in again) or run again with sudo.")"
      ;;
    *)
      if [ "$OS" = Darwin ]; then
        hint=$(t "Lance Docker Desktop, attends qu'il soit prêt, puis relance cette commande." \
          "Start Docker Desktop, wait until it is ready, then run this command again.")
      else
        hint=$(t "Démarre-le (sudo systemctl start docker) puis relance cette commande." \
          "Start it (sudo systemctl start docker), then run this command again.")
      fi
      die "$(t "Docker est installé mais ne tourne pas." "Docker is installed but not running.")" "$hint"
      ;;
  esac
fi
ok "$(t "Docker est démarré" "Docker is running")"

if docker compose version > /dev/null 2>&1; then
  COMPOSE=plugin
elif has docker-compose; then
  COMPOSE=standalone
else
  die "$(t "Docker Compose est introuvable." "Docker Compose was not found.")" \
    "https://docs.docker.com/compose/install/"
fi
ok "Docker Compose $(compose version --short 2> /dev/null || echo '?')"

if [ "$VERSION" != latest ] && [ "${BIS_SKIP_PULL:-}" != 1 ]; then
  docker manifest inspect "ghcr.io/juc0ag0g0/back-in-stock:$VERSION" > /dev/null 2>&1 ||
    die "$(t "La version $VERSION n'existe pas." "Version $VERSION does not exist.")" \
      "$(t "Versions publiées :" "Published versions:") https://github.com/JUC0AG0G0/Back-in-stock/releases"
fi
ok "$(t "Version" "Version") $VERSION"

# ---------- 3. settings ----------

printf '\n'
step "$(t "Réglages (Entrée pour garder la valeur proposée)" "Settings (press Enter to keep the suggested value)")"

ask "$(t "Dossier d'installation :" "Install folder:")" "${BIS_DIR:-$HOME/back-in-stock}"
case "$REPLY" in
  "~") REPLY=$HOME ;;
  \~/*) REPLY="$HOME/${REPLY#\~/}" ;;
esac
mkdir -p "$REPLY" || die "$(t "Impossible de créer le dossier $REPLY" "Could not create the folder $REPLY")"
DIR=$(cd "$REPLY" && pwd -P)
COMPOSE_FILE="$DIR/docker-compose.yml"

ENV_FILE="$DIR/.env"

# env_get KEY → value of KEY in the existing .env
env_get() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d "\"'" || true; }

# An existing install: its settings become the defaults.
OLD_PORT="" OLD_TZ="" OLD_UPDATER=""
if [ -f "$COMPOSE_FILE" ]; then
  OLD_PORT=$(env_get BIS_PORT)
  OLD_TZ=$(env_get BIS_TZ)
  # docker-compose.yml written by hand, before this installer existed.
  [ -n "$OLD_PORT" ] || OLD_PORT=$(sed -n "s/^ *- *['\"]\{0,1\}\([0-9]*\):8080['\"]\{0,1\} *$/\1/p" "$COMPOSE_FILE" | head -n 1)
  [ -n "$OLD_TZ" ] || OLD_TZ=$(sed -n 's/^ *TZ: *//p' "$COMPOSE_FILE" | head -n 1 | tr -d "\"'" | grep -v '[$]' || true)
  if grep -q '^  updater:' "$COMPOSE_FILE"; then OLD_UPDATER=yes; else OLD_UPDATER=no; fi
  warn "$(t "Installation existante trouvée : elle sera mise à jour, tes données sont conservées." \
    "Existing install found: it will be updated, your data is kept.")"
fi

default_port=${BIS_PORT:-${OLD_PORT:-8080}}
while :; do
  ask "$(t "Port de l'interface web :" "Web interface port:")" "$default_port"
  PORT=$REPLY
  if ! valid_port "$PORT"; then
    msg=$(t "Port invalide : $PORT (entre 1 et 65535)." "Invalid port: $PORT (between 1 and 65535).")
  elif port_busy "$PORT" && ! port_is_ours "$PORT"; then
    msg=$(t "Le port $PORT est déjà utilisé sur cette machine." "Port $PORT is already in use on this machine.")
  else
    break
  fi
  [ "$INTERACTIVE" = 1 ] || die "$msg" "$(t "Choisis-en un autre avec BIS_PORT." "Pick another one with BIS_PORT.")"
  warn "$msg"
  default_port=$((PORT + 1))
  valid_port "$default_port" || default_port=8080
done

while :; do
  ask "$(t "Fuseau horaire :" "Time zone:")" "${BIS_TZ:-${OLD_TZ:-$(detect_tz)}}"
  TZ_VALUE=$REPLY
  case "$TZ_VALUE" in
    *[!A-Za-z0-9_+/-]* | "") ;;
    *) break ;;
  esac
  [ "$INTERACTIVE" = 1 ] || die "$(t "Fuseau horaire invalide : $TZ_VALUE" "Invalid time zone: $TZ_VALUE")"
  warn "$(t "Fuseau horaire invalide, par exemple : Europe/Paris" "Invalid time zone, for example: Europe/Paris")"
done

# One-click updates need a small companion container with access to the Docker socket. Only
# offered once its image is published.
if [ "$UPDATER" != no ] && docker manifest inspect "$UPDATER_IMAGE" > /dev/null 2>&1; then
  if [ -z "$UPDATER" ] && [ "$INTERACTIVE" = 1 ]; then
    question=$(t "Activer la mise à jour en un clic (accès au socket Docker) ?" \
      "Enable one-click updates (access to the Docker socket)?")
    if [ "$OLD_UPDATER" = no ]; then # keep a previous "no" as the default
      printf '  %s %s[%s]%s ' "$question" "$BOLD" "$(t "o/N" "y/N")" "$RESET" > /dev/tty
      IFS= read -r answer < /dev/tty || answer=""
      case "$answer" in [oOyY]*) UPDATER=yes ;; *) UPDATER=no ;; esac
    elif confirm "$question"; then UPDATER=yes; else UPDATER=no; fi
  fi
  [ -n "$UPDATER" ] || UPDATER=${OLD_UPDATER:-yes}
else
  UPDATER=no
fi

printf '\n'
confirm "$(t "Installer dans $DIR sur le port $PORT ?" "Install in $DIR on port $PORT?")" ||
  die "$(t "Installation annulée." "Install cancelled.")"

# ---------- 4. docker-compose.yml and .env ----------

printf '\n'
step "$(t "Écriture de la configuration" "Writing the configuration")"

TMP=$(mktemp -d 2> /dev/null || mktemp -d -t bis-install)
trap 'rm -rf "$TMP"' EXIT INT TERM

# Same layout as the docker-compose.yml of the repository. The values live in .env, which the
# one-click updater rewrites (BIS_IMAGE_TAG only) to change version.
{
  cat << 'EOF'
# Back in stock ! - written by the installer. Settings are in .env next to this file.
# Docs: https://juc0ag0g0.github.io/Back-in-stock/
services:
  back-in-stock:
    image: ghcr.io/juc0ag0g0/back-in-stock:${BIS_IMAGE_TAG:-latest}
    restart: unless-stopped
    ports:
      - '${BIS_PORT:-8080}:8080'
    volumes:
      - ./data:/data
    environment:
      TZ: ${BIS_TZ:-Europe/Paris}
EOF
  if [ "$UPDATER" = yes ]; then
    cat << 'EOF'
      BIS_UPDATER_URL: http://updater:8090

  # One-click updates from the web interface: pulls the new image and restarts back-in-stock.
  updater:
    image: ghcr.io/juc0ag0g0/back-in-stock-updater:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - .:/install
    environment:
      BIS_TARGET_SERVICE: back-in-stock
EOF
  fi
} > "$TMP/docker-compose.yml"

{
  echo "# Back in stock ! settings, read by docker compose. Apply a change with: docker compose up -d"
  echo "BIS_IMAGE_TAG=$VERSION"
  echo "BIS_PORT=$PORT"
  echo "BIS_TZ=$TZ_VALUE"
  # Keep any other line the user added.
  if [ -f "$ENV_FILE" ]; then
    grep -v -e '^BIS_IMAGE_TAG=' -e '^BIS_PORT=' -e '^BIS_TZ=' -e '^# Back in stock ! settings' "$ENV_FILE" || true
  fi
} > "$TMP/.env"

if [ -f "$COMPOSE_FILE" ] && ! cmp -s "$COMPOSE_FILE" "$TMP/docker-compose.yml"; then
  cp "$COMPOSE_FILE" "$COMPOSE_FILE.bak"
  ok "$(t "Ancien docker-compose.yml sauvegardé dans docker-compose.yml.bak" "Previous docker-compose.yml saved as docker-compose.yml.bak")"
fi
cp "$TMP/docker-compose.yml" "$COMPOSE_FILE"
cp "$TMP/.env" "$ENV_FILE"
ok "$COMPOSE_FILE"
ok "$ENV_FILE"

mkdir -p "$DIR/data"

# ---------- 5. start ----------

printf '\n'
step "$(t "Démarrage (le premier téléchargement de l'image peut prendre une minute)" "Starting (the first image download can take a minute)")"
cd "$DIR"

# The shell environment wins over .env in docker compose: a BIS_PORT= left over in the caller's
# environment would override the value just written.
unset BIS_IMAGE_TAG BIS_PORT BIS_TZ

compose config -q || die "$(t "La configuration générée est invalide." "The generated configuration is invalid.")"

if [ "${BIS_SKIP_PULL:-}" != 1 ]; then
  compose pull --quiet || die "$(t "Téléchargement de l'image impossible (version $VERSION)." "Could not download the image (version $VERSION).")"
fi

# On Linux the container user (node, uid 1000) must own the data folder, whoever runs this script.
if [ "$OS" = Linux ] && [ "$(stat -c %u data 2> /dev/null || echo 1000)" != 1000 ]; then
  compose run --rm --no-deps --user root back-in-stock chown node:node /data > /dev/null 2>&1 ||
    warn "$(t "Impossible de donner le dossier data au conteneur : vérifie ses droits si l'app ne démarre pas." \
      "Could not hand the data folder to the container: check its permissions if the app does not start.")"
fi

compose up -d --remove-orphans || die "$(t "docker compose up a échoué." "docker compose up failed.")"

printf '  %s' "$(t "Attente de l'application" "Waiting for the app")"
i=0
until curl -fsS "http://127.0.0.1:$PORT/api/health" 2> /dev/null | grep -q '"status":"ok"'; do
  i=$((i + 2))
  if [ "$i" -ge "$HEALTH_TIMEOUT" ]; then
    printf '\n'
    compose logs --tail 40 >&2 || true
    die "$(t "L'application ne répond pas après ${HEALTH_TIMEOUT}s (journaux ci-dessus)." "The app does not answer after ${HEALTH_TIMEOUT}s (logs above).")"
  fi
  printf '.'
  sleep 2
done
printf '\n'
ok "$(t "Back in stock ! est prêt" "Back in stock ! is ready") ($(curl -fsS "http://127.0.0.1:$PORT/api/health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'))"

# ---------- 6. done ----------

ip=$(lan_ip)
printf '\n%s🎉 %s%s\n\n' "$BOLD" "$(t "C'est prêt ! Ouvre :" "All set! Open:")" "$RESET"
printf '   %shttp://localhost:%s%s\n' "$GREEN" "$PORT" "$RESET"
[ -z "$ip" ] || printf '   http://%s:%s %s\n' "$ip" "$PORT" "$(t "(depuis un autre appareil du réseau)" "(from another device on your network)")"
printf '\n'
printf '  %s %s\n' "$(t "Dossier :" "Folder:")" "$DIR"
printf '  %s %s\n' "$(t "Données :" "Data:")" "$DIR/data $(t "(le seul dossier à sauvegarder)" "(the only folder to back up)")"
printf '  %s cd %s && docker compose logs -f\n' "$(t "Journaux :" "Logs:")" "$DIR"
printf '  %s cd %s && docker compose down\n' "$(t "Arrêter :" "Stop:")" "$DIR"
printf '  %s %s\n\n' "$(t "Mettre à jour :" "Update:")" "$(t "relance la même commande d'installation" "run the same install command again")$([ "$UPDATER" != yes ] || t ", ou depuis l'interface" ", or from the web interface")"
