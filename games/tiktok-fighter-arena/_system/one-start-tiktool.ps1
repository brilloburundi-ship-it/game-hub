param(
  [string]$PackageRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Port = 8777
$HealthUrl = "http://127.0.0.1:$Port/__health"
$LiveUser = 'ia.videoclips.cre'
$LiveUrl = "http://127.0.0.1:$Port/desktop-live.html?liveUser=$([uri]::EscapeDataString($LiveUser))"
$ServerFile = Join-Path $PackageRoot 'web-safe-server.mjs'
$RuntimeRoot = Join-Path $PackageRoot '.runtime'
$PortableNodeDir = Join-Path $RuntimeRoot 'node'
$PortableNode = Join-Path $PortableNodeDir 'node.exe'

function Write-Step([string]$Text) {
  Write-Host "[Fighter Arena] $Text" -ForegroundColor Cyan
}

function Test-FighterServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $HealthUrl
    if ($response.StatusCode -ne 200) { return $false }
    $json = $response.Content | ConvertFrom-Json
    return ($json.ok -eq $true -and $json.liveBridge -eq 'tiktool')
  } catch {
    return $false
  }
}

function Get-NodeExecutable {
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($systemNode) {
    Write-Step "Node.js trovato: $($systemNode.Source)"
    return $systemNode.Source
  }

  if (Test-Path -LiteralPath $PortableNode) {
    Write-Step 'Runtime Node.js locale gia presente.'
    return $PortableNode
  }

  Write-Step 'Node.js non trovato. Download automatico del runtime LTS ufficiale...'
  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

  $baseUrl = 'https://nodejs.org/dist/latest-v22.x/'
  $manifestUrl = $baseUrl + 'SHASUMS256.txt'
  $manifest = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $manifestUrl).Content
  $match = [regex]::Match($manifest, '(?m)^([0-9a-f]{64})\s+(node-v[^\s]+-win-x64\.zip)\s*$')
  if (-not $match.Success) {
    throw 'Impossibile determinare il pacchetto Node.js Windows x64 dalla fonte ufficiale.'
  }

  $expectedHash = $match.Groups[1].Value.ToLowerInvariant()
  $fileName = $match.Groups[2].Value
  $downloadUrl = $baseUrl + $fileName
  $zipPath = Join-Path $RuntimeRoot $fileName
  $extractDir = Join-Path $RuntimeRoot 'node-extract'

  if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

  Write-Step "Scarico $fileName da nodejs.org..."
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri $downloadUrl -OutFile $zipPath

  $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    throw 'Verifica SHA256 del runtime Node.js fallita. Download annullato.'
  }

  Write-Step 'Download verificato. Estraggo il runtime locale...'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
  $nodeExe = Get-ChildItem -LiteralPath $extractDir -Filter node.exe -Recurse -File | Select-Object -First 1
  if (-not $nodeExe) { throw 'node.exe non trovato dopo l estrazione.' }

  if (Test-Path -LiteralPath $PortableNodeDir) { Remove-Item -LiteralPath $PortableNodeDir -Recurse -Force }
  Move-Item -LiteralPath $nodeExe.Directory.FullName -Destination $PortableNodeDir
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

  if (-not (Test-Path -LiteralPath $PortableNode)) { throw 'Installazione runtime Node.js locale incompleta.' }
  Write-Step 'Runtime Node.js pronto. Nessuna installazione Windows necessaria.'
  return $PortableNode
}

try {
  if (-not (Test-Path -LiteralPath $ServerFile)) {
    throw 'Pacchetto incompleto: manca web-safe-server.mjs.'
  }

  $NodeExe = Get-NodeExecutable

  if (-not (Test-FighterServer)) {
    Write-Step 'Avvio del server locale Fighter Arena...'
    Start-Process -FilePath $NodeExe -ArgumentList @($ServerFile) -WorkingDirectory $PackageRoot -WindowStyle Hidden

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-FighterServer) { $ready = $true; break }
    }
    if (-not $ready) {
      throw "Il server locale non risponde sulla porta $Port. Verifica che la porta non sia occupata."
    }
  } else {
    Write-Step 'Server Fighter Arena gia attivo.'
  }

  Write-Step "Account LIVE configurato: @$LiveUser"
  Write-Step 'Apro Fighter Arena TikTool...'

  $browserCandidates = @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
  )
  $browser = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

  if ($browser) {
    Start-Process -FilePath $browser -ArgumentList @("--app=$LiveUrl", '--start-maximized')
  } else {
    Start-Process $LiveUrl
  }

  Write-Host ''
  Write-Host '[OK] Fighter Arena avviata.' -ForegroundColor Green
  Write-Host '[OK] TikTool configurato per @ia.videoclips.cre.' -ForegroundColor Green
  Write-Host '[OK] Pallino verde = connesso, rosso = disconnesso.' -ForegroundColor Green
  exit 0
} catch {
  Write-Host ''
  Write-Host ('[ERRORE] ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
