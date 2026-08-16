param(
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$AppName = 'Fighter Arena WEB SAFE'
$InstallDir = Join-Path $env:LOCALAPPDATA 'FighterArenaWebSafe'
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Fighter Arena'
$Desktop = [Environment]::GetFolderPath('Desktop')
$DesktopShortcut = Join-Path $Desktop 'Fighter Arena WEB SAFE.lnk'
$StartShortcut = Join-Path $StartMenuDir 'Fighter Arena WEB SAFE.lnk'

Write-Host ''
Write-Host '=============================================================' -ForegroundColor Cyan
Write-Host ' FIGHTER ARENA - WEB DESKTOP SAFE - INSTALLAZIONE COMPLETA' -ForegroundColor Cyan
Write-Host '=============================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Questa installazione NON modifica TikFinity e NON modifica LIVE Studio.'
Write-Host 'Installa solo il gioco web locale e il suo piccolo server HTTP.'
Write-Host ''

$Node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $Node) {
  $Candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    'C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  )
  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path $candidate)) { $Node = Get-Item $candidate; break }
  }
}

if (-not $Node) {
  Write-Host '[INFO] Node.js non trovato. Provo a installare Node.js LTS automaticamente con winget...' -ForegroundColor Yellow
  $Winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $Winget) {
    throw 'Node.js non trovato e winget non disponibile. Installa Node.js LTS, poi rilancia questo installer.'
  }
  & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent
  if ($LASTEXITCODE -ne 0) { throw "Installazione Node.js fallita (codice $LASTEXITCODE)." }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $Node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $Node) {
    $candidate = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $candidate) { $Node = Get-Item $candidate }
  }
  if (-not $Node) { throw 'Node.js risulta installato ma node.exe non e ancora raggiungibile. Riavvia Windows e rilancia l installer.' }
}

Write-Host ('[OK] Node.js: ' + $Node.Source) -ForegroundColor Green

if (Test-Path $InstallDir) {
  Write-Host '[INFO] Aggiornamento installazione esistente...' -ForegroundColor Yellow
} else {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$excludeDirs = @('.git','node_modules')
$excludeFiles = @(
  'AVVIA_IPHONE_TIKFINITY.bat','ABILITA_BRIDGE_WIFI.bat','KILL_ALL_GAME_BRIDGES_GLOBAL.cmd',
  'URL_IPHONE.txt','_probe_note.txt','_probe2_note.txt','_probe3_note.txt','_probe4_note.txt','_probe5_note.txt','_probe6_note.txt'
)

$robocopyArgs = @($SourceDir,$InstallDir,'/E','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP')
if ($excludeDirs.Count) { $robocopyArgs += '/XD'; $robocopyArgs += $excludeDirs }
if ($excludeFiles.Count) { $robocopyArgs += '/XF'; $robocopyArgs += $excludeFiles }
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Copia file fallita. Robocopy code $LASTEXITCODE" }

$Launcher = Join-Path $InstallDir 'START_FIGHTER_ARENA_WEB_SAFE.cmd'
if (-not (Test-Path $Launcher)) { throw 'Launcher WEB SAFE mancante dopo la copia.' }
if (-not (Test-Path (Join-Path $InstallDir 'desktop-live.html'))) { throw 'desktop-live.html mancante dopo la copia.' }
if (-not (Test-Path (Join-Path $InstallDir 'desktop-tikfinity-safe.js'))) { throw 'desktop-tikfinity-safe.js mancante dopo la copia.' }
if (-not (Test-Path (Join-Path $InstallDir 'web-safe-server.mjs'))) { throw 'web-safe-server.mjs mancante dopo la copia.' }

New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
$Shell = New-Object -ComObject WScript.Shell
foreach ($ShortcutPath in @($DesktopShortcut,$StartShortcut)) {
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $Launcher
  $Shortcut.WorkingDirectory = $InstallDir
  $Shortcut.Description = 'Fighter Arena WEB SAFE - TikFinity Event API isolata da TikTok LIVE Studio'
  $Shortcut.WindowStyle = 7
  $Shortcut.Save()
}

$Uninstall = @'
@echo off
setlocal
set "APPDIR=%LOCALAPPDATA%\FighterArenaWebSafe"
set "DESKTOP_LINK=%USERPROFILE%\Desktop\Fighter Arena WEB SAFE.lnk"
set "START_LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Fighter Arena\Fighter Arena WEB SAFE.lnk"
del /q "%DESKTOP_LINK%" 2>nul
del /q "%START_LINK%" 2>nul
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 800; Remove-Item -LiteralPath '%APPDIR%' -Recurse -Force -ErrorAction SilentlyContinue"
exit /b 0
'@
Set-Content -LiteralPath (Join-Path $InstallDir 'DISINSTALLA_FIGHTER_ARENA_WEB_SAFE.cmd') -Value $Uninstall -Encoding ASCII

@"
Fighter Arena WEB SAFE
Installato: $(Get-Date -Format s)
Percorso: $InstallDir
Modalita: desktop web app locale
TikFinity: solo Event API ws://127.0.0.1:21213 dopo il preload
Bridge 8795: NON usato
LIVE Studio: NON controllato
"@ | Set-Content -LiteralPath (Join-Path $InstallDir 'WEB_SAFE_INSTALL.txt') -Encoding UTF8

Write-Host ''
Write-Host '[OK] Installazione completata.' -ForegroundColor Green
Write-Host ('[OK] Cartella: ' + $InstallDir) -ForegroundColor Green
Write-Host '[OK] Collegamento creato sul Desktop e nel menu Start.' -ForegroundColor Green
Write-Host ''
Write-Host 'Sequenza LIVE consigliata:' -ForegroundColor Cyan
Write-Host '  1. Avvia LIVE Studio e vai LIVE.'
Write-Host '  2. Collega TikFinity e verifica che sia stabile.'
Write-Host '  3. Avvia Fighter Arena WEB SAFE dal Desktop.'
Write-Host ''
Write-Host 'Avvio Fighter Arena...' -ForegroundColor Cyan
Start-Process -FilePath $Launcher -WorkingDirectory $InstallDir
