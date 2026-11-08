# Back in stock ! installer for Windows (also runs with PowerShell 7 on macOS and Linux).
#
#   irm https://github.com/JUC0AG0G0/Back-in-stock/releases/latest/download/install.ps1 | iex
#
# Same steps and same files as install.sh: checks Docker, asks a few questions (folder, port,
# time zone, one-click updates), writes docker-compose.yml and its .env, starts the app and waits
# until it answers. Running it again updates an existing install, keeping its data and answers.
#
# `irm | iex` cannot pass arguments, so the options are environment variables:
#   $env:BIS_YES = '1'        no questions: defaults, or the BIS_* variables below
#   BIS_DIR, BIS_PORT, BIS_TZ, BIS_VERSION (e.g. 0.1.1, default latest),
#   BIS_UPDATER ('yes' or 'no'), BIS_LANG ('fr' or 'en'), BIS_SKIP_PULL ('1', for tests).
#
# This file must stay ASCII: Windows PowerShell 5.1 may decode a downloaded script with a legacy
# code page. Accented French text is written with \uXXXX escapes, decoded by T below.

function Install-BackInStock {
  $ErrorActionPreference = 'Continue' # native commands report through $LASTEXITCODE
  $UpdaterImage = 'ghcr.io/juc0ag0g0/back-in-stock-updater:latest'
  $HealthTimeout = 120

  $lang = if ($env:BIS_LANG) { $env:BIS_LANG } else { (Get-Culture).TwoLetterISOLanguageName }
  $isFrench = $lang -like 'fr*'

  function T([string]$Fr, [string]$En) {
    if ($isFrench) { [regex]::Unescape($Fr) } else { $En }
  }
  function Step([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
  function Ok([string]$m) { Write-Host "  + $m" -ForegroundColor Green }
  function Warn([string]$m) { Write-Host "  ! $m" -ForegroundColor Yellow }
  function Fail([string]$m, [string]$hint = '') {
    if ($hint) { throw "$m`n  $hint" } else { throw $m }
  }
  function Has([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

  $interactive = ($env:BIS_YES -ne '1') -and -not [Console]::IsInputRedirected

  function Ask([string]$question, [string]$default) {
    if (-not $interactive) { return $default }
    $answer = Read-Host "  $question [$default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { $default } else { $answer.Trim() }
  }
  function Confirm([string]$question, [bool]$default = $true) {
    if (-not $interactive) { return $default }
    $choices = if ($default) { T 'O/n' 'Y/n' } else { T 'o/N' 'y/N' }
    $answer = Read-Host "  $question [$choices]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
    return $answer -match '^[oOyY]'
  }
  function Compose {
    if ($script:composePlugin) { & docker compose @args } else { & docker-compose @args }
  }
  function Test-PortBusy([int]$port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
      $pending = $client.BeginConnect('127.0.0.1', $port, $null, $null)
      if ($pending.AsyncWaitHandle.WaitOne(300)) { $client.EndConnect($pending); return $true }
      return $false
    } catch { return $false } finally { $client.Close() }
  }
  # The port is held by this very install (re-run to update): not a conflict.
  function Test-PortOurs([int]$port) {
    $dirs = & docker ps --filter "publish=$port" --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>$null
    return [bool]($dirs | Where-Object { $_ -and ($_.TrimEnd('\', '/') -eq $dir.TrimEnd('\', '/')) })
  }
  function Get-DefaultTimeZone {
    if ($env:TZ -match '/') { return $env:TZ }
    $id = [TimeZoneInfo]::Local.Id
    if ($id -match '^[A-Za-z]+/[A-Za-z0-9_+/-]+$') { return $id } # already IANA (macOS, Linux)
    $iana = $null
    try {
      if ([TimeZoneInfo]::TryConvertWindowsIdToIanaId($id, [ref]$iana)) { return $iana } # .NET 6+
    } catch { }
    return 'Europe/Paris'
  }
  function Get-LanIp {
    try {
      $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1 -ExpandProperty IPAddress
      return $ip
    } catch { return $null }
  }
  function Write-UnixFile([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text.Replace("`r`n", "`n")) # UTF-8 without BOM
  }

  Write-Host ''
  Write-Host ('Back in stock ! ' + (T 'installation' 'installer')) -ForegroundColor White
  Write-Host ''

  # ---------- 1. prerequisites ----------

  Step (T 'V\u00e9rification des pr\u00e9requis' 'Checking requirements')

  if (-not (Has 'docker')) {
    Fail (T "Docker n'est pas install\u00e9." 'Docker is not installed.') `
      ((T "Installe Docker Desktop d'abord :" 'Install Docker Desktop first:') + ' https://docs.docker.com/desktop/setup/install/windows-install/')
  }
  Ok ('Docker ' + (& docker version --format '{{.Client.Version}}' 2>$null))

  $info = & docker info 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    if ($info -match 'permission denied') {
      Fail (T "Docker refuse l'acc\u00e8s \u00e0 ton utilisateur." 'Docker denies access to your user.') `
        (T 'Ajoute-le au groupe docker, ou relance en administrateur.' 'Add it to the docker group, or run again as administrator.')
    }
    Fail (T "Docker est install\u00e9 mais ne tourne pas." 'Docker is installed but not running.') `
      (T "Lance Docker Desktop, attends qu'il soit pr\u00eat, puis relance cette commande." 'Start Docker Desktop, wait until it is ready, then run this command again.')
  }
  Ok (T 'Docker est d\u00e9marr\u00e9' 'Docker is running')

  & docker compose version *> $null
  if ($LASTEXITCODE -eq 0) { $script:composePlugin = $true }
  elseif (Has 'docker-compose') { $script:composePlugin = $false }
  else { Fail (T 'Docker Compose est introuvable.' 'Docker Compose was not found.') 'https://docs.docker.com/compose/install/' }
  Ok ('Docker Compose ' + (Compose version --short 2>$null))

  $version = if ($env:BIS_VERSION) { $env:BIS_VERSION.TrimStart('v') } else { 'latest' }
  if ($version -notmatch '^[0-9A-Za-z._-]+$') { Fail ((T 'Version invalide : ' 'Invalid version: ') + $version) }
  if ($version -ne 'latest' -and $env:BIS_SKIP_PULL -ne '1') {
    & docker manifest inspect "ghcr.io/juc0ag0g0/back-in-stock:$version" *> $null
    if ($LASTEXITCODE -ne 0) {
      Fail ((T 'La version ' 'Version ') + $version + (T " n'existe pas." ' does not exist.')) `
        ((T 'Versions publi\u00e9es : ' 'Published versions: ') + 'https://github.com/JUC0AG0G0/Back-in-stock/releases')
    }
  }
  Ok ((T 'Version ' 'Version ') + $version)

  # ---------- 2. settings ----------

  Write-Host ''
  Step (T 'R\u00e9glages (Entr\u00e9e pour garder la valeur propos\u00e9e)' 'Settings (press Enter to keep the suggested value)')

  $defaultDir = if ($env:BIS_DIR) { $env:BIS_DIR } else { Join-Path $HOME 'back-in-stock' }
  $answer = Ask (T "Dossier d'installation :" 'Install folder:') $defaultDir
  if ($answer -like '~*') { $answer = $HOME + $answer.Substring(1) }
  try { $dir = (New-Item -ItemType Directory -Force -Path $answer -ErrorAction Stop).FullName }
  catch { Fail ((T 'Impossible de cr\u00e9er le dossier ' 'Could not create the folder ') + $answer) }
  $composeFile = Join-Path $dir 'docker-compose.yml'
  $envFile = Join-Path $dir '.env'

  # An existing install: its settings become the defaults.
  $oldEnv = @{}
  $oldPort = $null; $oldTz = $null; $oldUpdater = $null
  if (Test-Path $composeFile) {
    if (Test-Path $envFile) {
      foreach ($line in Get-Content $envFile) {
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $oldEnv[$Matches[1]] = $Matches[2].Trim('"', "'") }
      }
    }
    $composeText = Get-Content $composeFile -Raw
    $oldPort = $oldEnv['BIS_PORT']
    if (-not $oldPort -and $composeText -match "(?m)^\s*-\s*['""]?(\d+):8080") { $oldPort = $Matches[1] }
    $oldTz = $oldEnv['BIS_TZ']
    if (-not $oldTz -and $composeText -match "(?m)^\s*TZ:\s*['""]?([A-Za-z0-9_+/-]+)") { $oldTz = $Matches[1] }
    $oldUpdater = if ($composeText -match '(?m)^  updater:') { 'yes' } else { 'no' }
    Warn (T "Installation existante trouv\u00e9e : elle sera mise \u00e0 jour, tes donn\u00e9es sont conserv\u00e9es." 'Existing install found: it will be updated, your data is kept.')
  }

  $defaultPort = if ($env:BIS_PORT) { $env:BIS_PORT } elseif ($oldPort) { $oldPort } else { '8080' }
  while ($true) {
    $port = Ask (T "Port de l'interface web :" 'Web interface port:') $defaultPort
    $n = 0
    if (-not ([int]::TryParse($port, [ref]$n) -and $n -ge 1 -and $n -le 65535)) {
      $msg = (T 'Port invalide : ' 'Invalid port: ') + $port + (T ' (entre 1 et 65535).' ' (between 1 and 65535).')
    } elseif ((Test-PortBusy $n) -and -not (Test-PortOurs $n)) {
      $msg = (T 'Le port ' 'Port ') + $port + (T " est d\u00e9j\u00e0 utilis\u00e9 sur cette machine." ' is already in use on this machine.')
    } else { $port = $n; break }
    if (-not $interactive) { Fail $msg (T 'Choisis-en un autre avec BIS_PORT.' 'Pick another one with BIS_PORT.') }
    Warn $msg
    $defaultPort = if ($n -ge 1 -and $n -lt 65535) { $n + 1 } else { 8080 }
  }

  $defaultTz = if ($env:BIS_TZ) { $env:BIS_TZ } elseif ($oldTz) { $oldTz } else { Get-DefaultTimeZone }
  while ($true) {
    $tz = Ask (T 'Fuseau horaire :' 'Time zone:') $defaultTz
    if ($tz -match '^[A-Za-z0-9_+/-]+$') { break }
    if (-not $interactive) { Fail ((T 'Fuseau horaire invalide : ' 'Invalid time zone: ') + $tz) }
    Warn (T 'Fuseau horaire invalide, par exemple : Europe/Paris' 'Invalid time zone, for example: Europe/Paris')
  }

  # One-click updates need a small companion container with access to the Docker socket. Only
  # offered once its image is published.
  $updater = $env:BIS_UPDATER
  & docker manifest inspect $UpdaterImage *> $null
  if ($updater -ne 'no' -and $LASTEXITCODE -eq 0) {
    if (-not $updater -and $interactive) {
      $yes = Confirm (T "Activer la mise \u00e0 jour en un clic (acc\u00e8s au socket Docker) ?" 'Enable one-click updates (access to the Docker socket)?') ($oldUpdater -ne 'no')
      $updater = if ($yes) { 'yes' } else { 'no' }
    }
    if (-not $updater) { $updater = if ($oldUpdater) { $oldUpdater } else { 'yes' } }
  } else { $updater = 'no' }

  Write-Host ''
  $question = (T 'Installer dans ' 'Install in ') + $dir + (T ' sur le port ' ' on port ') + $port + ' ?'
  if (-not (Confirm $question)) { Fail (T 'Installation annul\u00e9e.' 'Install cancelled.') }

  # ---------- 3. docker-compose.yml and .env ----------

  Write-Host ''
  Step (T "\u00c9criture de la configuration" 'Writing the configuration')

  # Same content as install.sh writes.
  $compose = @'
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

'@
  if ($updater -eq 'yes') {
    $compose += @'
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

'@
  }

  $envLines = @(
    '# Back in stock ! settings, read by docker compose. Apply a change with: docker compose up -d'
    "BIS_IMAGE_TAG=$version"
    "BIS_PORT=$port"
    "BIS_TZ=$tz"
  )
  if (Test-Path $envFile) { # keep any other line the user added
    $envLines += Get-Content $envFile | Where-Object { $_ -notmatch '^(BIS_IMAGE_TAG|BIS_PORT|BIS_TZ)=' -and $_ -notlike '# Back in stock ! settings*' }
  }

  if ((Test-Path $composeFile) -and ((Get-Content $composeFile -Raw).Replace("`r`n", "`n") -ne $compose.Replace("`r`n", "`n"))) {
    Copy-Item $composeFile "$composeFile.bak" -Force
    Ok (T "Ancien docker-compose.yml sauvegard\u00e9 dans docker-compose.yml.bak" 'Previous docker-compose.yml saved as docker-compose.yml.bak')
  }
  Write-UnixFile $composeFile $compose
  Write-UnixFile $envFile (($envLines -join "`n") + "`n")
  Ok $composeFile
  Ok $envFile
  New-Item -ItemType Directory -Force -Path (Join-Path $dir 'data') | Out-Null

  # ---------- 4. start ----------

  Write-Host ''
  Step (T "D\u00e9marrage (le premier t\u00e9l\u00e9chargement de l'image peut prendre une minute)" 'Starting (the first image download can take a minute)')
  Push-Location $dir
  # The shell environment wins over .env in docker compose: use the values just written.
  $savedEnv = @{}
  foreach ($k in 'BIS_IMAGE_TAG', 'BIS_PORT', 'BIS_TZ') { $savedEnv[$k] = [Environment]::GetEnvironmentVariable($k) }
  $env:BIS_IMAGE_TAG = $version; $env:BIS_PORT = "$port"; $env:BIS_TZ = $tz
  try {
    Compose config -q
    if ($LASTEXITCODE -ne 0) { Fail (T "La configuration g\u00e9n\u00e9r\u00e9e est invalide." 'The generated configuration is invalid.') }

    if ($env:BIS_SKIP_PULL -ne '1') {
      Compose pull --quiet
      if ($LASTEXITCODE -ne 0) { Fail ((T "T\u00e9l\u00e9chargement de l'image impossible, version " 'Could not download the image, version ') + $version) }
    }

    # On Linux the container user (node, uid 1000) must own the data folder.
    if ($IsLinux -and ((& stat -c %u data 2>$null) -ne '1000')) {
      Compose run --rm --no-deps --user root back-in-stock chown node:node /data *> $null
    }

    Compose up -d --remove-orphans
    if ($LASTEXITCODE -ne 0) { Fail (T "docker compose up a \u00e9chou\u00e9." 'docker compose up failed.') }

    Write-Host -NoNewline ('  ' + (T "Attente de l'application" 'Waiting for the app'))
    $deadline = (Get-Date).AddSeconds($HealthTimeout)
    $health = $null
    while (-not $health) {
      try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3 -ErrorAction Stop
        if ($r.status -eq 'ok') { $health = $r }
      } catch { }
      if ($health) { break }
      if ((Get-Date) -gt $deadline) {
        Write-Host ''
        Compose logs --tail 40
        Fail ((T "L'application ne r\u00e9pond pas apr\u00e8s " 'The app does not answer after ') + "${HealthTimeout}s" + (T ' (journaux ci-dessus).' ' (logs above).'))
      }
      Write-Host -NoNewline '.'
      Start-Sleep -Seconds 2
    }
    Write-Host ''
    Ok ((T "Back in stock ! est pr\u00eat" 'Back in stock ! is ready') + " ($($health.version))")
  } finally {
    foreach ($k in $savedEnv.Keys) { [Environment]::SetEnvironmentVariable($k, $savedEnv[$k]) }
    Pop-Location
  }

  # ---------- 5. done ----------

  $ip = Get-LanIp
  Write-Host ''
  Write-Host (T "C'est pr\u00eat ! Ouvre :" 'All set! Open:') -ForegroundColor White
  Write-Host ''
  Write-Host "   http://localhost:$port" -ForegroundColor Green
  if ($ip) { Write-Host ("   http://${ip}:$port " + (T "(depuis un autre appareil du r\u00e9seau)" '(from another device on your network)')) }
  Write-Host ''
  Write-Host ('  ' + (T 'Dossier : ' 'Folder: ') + $dir)
  Write-Host ('  ' + (T "Donn\u00e9es : " 'Data: ') + (Join-Path $dir 'data') + (T " (le seul dossier \u00e0 sauvegarder)" ' (the only folder to back up)'))
  Write-Host ('  ' + (T 'Journaux : ' 'Logs: ') + "cd `"$dir`"; docker compose logs -f")
  Write-Host ('  ' + (T "Arr\u00eater : " 'Stop: ') + "cd `"$dir`"; docker compose down")
  $update = T "relance la m\u00eame commande d'installation" 'run the same install command again'
  if ($updater -eq 'yes') { $update += T ", ou depuis l'interface" ', or from the web interface' }
  Write-Host ('  ' + (T "Mettre \u00e0 jour : " 'Update: ') + $update)
  Write-Host ''
}

try {
  Install-BackInStock
} catch {
  Write-Host ''
  Write-Host ('X ' + $_.Exception.Message) -ForegroundColor Red
  if ($env:BIS_DEBUG) { Write-Host $_.ScriptStackTrace }
  # Run as a file (CI, `pwsh -File`): fail the process. Through `irm | iex`: keep the user's window open.
  if ($PSCommandPath) { exit 1 }
}
