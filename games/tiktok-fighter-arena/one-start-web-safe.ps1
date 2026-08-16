param(
  [Parameter(Mandatory=$true)][string]$PackageRoot
)

$ErrorActionPreference = 'Stop'
$AppName = 'Fighter Arena WEB SAFE'
$InstallDir = Join-Path $env:LOCALAPPDATA 'FighterArenaWebSafe'
$Desktop = [Environment]::GetFolderPath('Desktop')
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Fighter Arena'
$DesktopShortcut = Join-Path $Desktop 'Fighter Arena WEB SAFE.lnk'
$StartShortcut = Join-Path $StartMenuDir 'Fighter Arena WEB SAFE.lnk'
$Port = 8777
$LiveUrl = "http://127.0.0.1:$Port/desktop-live.html"
$HealthUrl = "http://127.0.0.1:$Port/__health"

function FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Test-Health {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 $HealthUrl
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Find-Node {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Ensure-Node {
  $node = Find-Node
  if ($node) { return $node }

  Write-Host '[INFO] Primo avvio: installazione automatica Node.js LTS...' -ForegroundColor Yellow
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'Node.js non trovato e winget non disponibile. Installa Node.js LTS e rilancia AVVIA.'
  }
  & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) { throw "Installazione Node.js fallita, codice $LASTEXITCODE." }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $node = Find-Node
  if (-not $node) { throw 'Node.js installato ma non ancora disponibile. Riavvia Windows e premi di nuovo AVVIA.' }
  return $node
}

function Copy-Package([string]$SourceRoot, [string]$TargetRoot) {
  $source = FullPath $SourceRoot
  $target = FullPath $TargetRoot
  if ($source -ieq $target) { return }

  $staging = "$TargetRoot.__new"
  $backup = "$TargetRoot.__old"
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $staging -Force | Out-Null

  $skipNames = @('LEGGIMI_PRIMA.txt')
  Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
    if ($skipNames -contains $_.Name) { return }
    Copy-Item -LiteralPath $_.FullName -Destination $staging -Recurse -Force
  }

  foreach ($required in @(
    'AVVIA_FIGHTER_ARENA_WEB_SAFE.cmd',
    '_system\one-start-web-safe.ps1',
    '_system\desktop-live.html',
    '_system\desktop-tikfinity-safe.js',
    '_system\web-safe-server.mjs'
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $staging $required))) {
      throw "Pacchetto incompleto: manca $required"
    }
  }

  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $TargetRoot) {
    Move-Item -LiteralPath $TargetRoot -Destination $backup -Force
  }
  Move-Item -LiteralPath $staging -Destination $TargetRoot -Force
  Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
}

function Ensure-Shortcuts([string]$Launcher) {
  New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  foreach ($shortcutPath in @($DesktopShortcut,$StartShortcut)) {
    try {
      $shortcut = $shell.CreateShortcut($shortcutPath)
      $shortcut.TargetPath = $Launcher
      $shortcut.WorkingDirectory = $InstallDir
      $shortcut.Description = 'Fighter Arena WEB SAFE'
      $shortcut.WindowStyle = 7
      $shortcut.Save()
    } catch {}
  }
}

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host ' FIGHTER ARENA WEB SAFE - UN SOLO AVVIA' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host 'Non avvia/chiude TikFinity. Non tocca LIVE Studio. Niente bridge 8795.'
Write-Host ''

$PackageRoot = FullPath $PackageRoot
$node = Ensure-Node

# Il pacchetto distribuito contiene i file di gioco dentro _system.
# Al primo avvio viene copiato in LocalAppData; ai successivi parte direttamente da li.
if ((FullPath $PackageRoot) -ine (FullPath $InstallDir)) {
  Write-Host '[INFO] Installazione/aggiornamento automatico...' -ForegroundColor Yellow
  Copy-Package -SourceRoot $PackageRoot -TargetRoot $InstallDir
}

$launcher = Join-Path $InstallDir 'AVVIA_FIGHTER_ARENA_WEB_SAFE.cmd'
$systemDir = Join-Path $InstallDir '_system'
$server = Join-Path $systemDir 'web-safe-server.mjs'
$desktop = Join-Path $systemDir 'desktop-live.html'
if (-not (Test-Path -LiteralPath $server)) { throw 'Server WEB SAFE mancante.' }
if (-not (Test-Path -LiteralPath $desktop)) { throw 'desktop-live.html mancante.' }

Ensure-Shortcuts -Launcher $launcher

if (-not (Test-Health)) {
  $portBusy = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if ($portBusy) {
    throw "La porta $Port e occupata da un altro programma. Chiudilo e premi di nuovo AVVIA."
  }
  Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $systemDir -WindowStyle Hidden
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 350
    if (Test-Health) { $ready = $true; break }
  }
  if (-not $ready) { throw 'Il server locale WEB SAFE non risponde.' }
}

$browser = Find-Browser
if ($browser) {
  Start-Process -FilePath $browser -ArgumentList @("--app=$LiveUrl", '--start-maximized')
} else {
  Start-Process $LiveUrl
}

Write-Host '[OK] Fighter Arena WEB SAFE avviata.' -ForegroundColor Green
Write-Host '[OK] Usa sempre e solo: AVVIA_FIGHTER_ARENA_WEB_SAFE.cmd' -ForegroundColor Green
Start-Sleep -Milliseconds 600
