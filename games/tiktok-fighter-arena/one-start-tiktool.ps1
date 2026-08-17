param()

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageRoot = $ScriptDir
if ((Split-Path -Leaf $ScriptDir) -ieq '_system') {
  $PackageRoot = Split-Path -Parent $ScriptDir
}
$PackageRoot = [System.IO.Path]::GetFullPath($PackageRoot)

$Port = 8777
$HealthUrl = "http://127.0.0.1:$Port/__health"
$LiveUser = 'ia.videoclips.cre'
$LiveUrl = "http://127.0.0.1:$Port/desktop-live.html?liveUser=$([uri]::EscapeDataString($LiveUser))"
$ServerFile = Join-Path $PackageRoot 'web-safe-server.mjs'
$RuntimeRoot = Join-Path $PackageRoot '.runtime'
$PortableNodeDir = Join-Path $RuntimeRoot 'node'
$PortableNode = Join-Path $PortableNodeDir 'node.exe'
$BundledKeyFile = Join-Path $PackageRoot 'tiktool-key.txt'
$SecretDir = Join-Path $env:LOCALAPPDATA 'FighterArena'
$SecretFile = Join-Path $SecretDir 'tiktool-key.dpapi'

function Write-Step([string]$Text) {
  Write-Host "[Fighter Arena] $Text" -ForegroundColor Cyan
}

function Convert-SecureStringToPlain([Security.SecureString]$Secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Save-ProtectedKey([string]$Plain) {
  if ([string]::IsNullOrWhiteSpace($Plain)) { throw 'TikTool API key vuota.' }
  New-Item -ItemType Directory -Path $SecretDir -Force | Out-Null
  $secure = ConvertTo-SecureString -String $Plain.Trim() -AsPlainText -Force
  Set-Content -LiteralPath $SecretFile -Value (ConvertFrom-SecureString $secure) -Encoding ASCII
}

function Get-TikToolApiKey {
  $fromEnv = [string]$env:TIKTOOL_API_KEY
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    Write-Step 'TikTool API key ricevuta dall ambiente.'
    return $fromEnv.Trim()
  }

  if (Test-Path -LiteralPath $BundledKeyFile) {
    $plain = (Get-Content -LiteralPath $BundledKeyFile -Raw).Trim()
    if (-not [string]::IsNullOrWhiteSpace($plain)) {
      Save-ProtectedKey $plain
      Remove-Item -LiteralPath $BundledKeyFile -Force -ErrorAction SilentlyContinue
      Write-Step 'TikTool API key importata e protetta con Windows.'
      return $plain
    }
  }

  if (Test-Path -LiteralPath $SecretFile) {
    try {
      $cipher = (Get-Content -LiteralPath $SecretFile -Raw).Trim()
      if ($cipher) {
        $secure = ConvertTo-SecureString $cipher
        $plain = Convert-SecureStringToPlain $secure
        if (-not [string]::IsNullOrWhiteSpace($plain)) {
          Write-Step 'TikTool API key caricata dal deposito Windows protetto.'
          return $plain.Trim()
        }
      }
    } catch {
      Remove-Item -LiteralPath $SecretFile -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host ''
  Write-Host 'CONFIGURAZIONE TIKTOOL' -ForegroundColor Yellow
  $secureInput = Read-Host 'Incolla la TikTool API key' -AsSecureString
  $plainInput = Convert-SecureStringToPlain $secureInput
  if ([string]::IsNullOrWhiteSpace($plainInput)) { throw 'TikTool API key non inserita.' }
  Save-ProtectedKey $plainInput
  Write-Step 'API key salvata cifrata con Windows DPAPI.'
  return $plainInput.Trim()
}

function Get-FighterHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $HealthUrl
    if ($response.StatusCode -ne 200) { return $null }
    return ($response.Content | ConvertFrom-Json)
  } catch { return $null }
}

function Stop-OldRuntime {
  $health = Get-FighterHealth
  if ($health -and $health.app -eq 'fighter-arena-web-safe') {
    Write-Step 'Chiudo il vecchio runtime Fighter Arena...'
    try {
      $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      foreach ($listener in $listeners) {
        if ($listener.OwningProcess -and $listener.OwningProcess -ne $PID) {
          Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        }
      }
      Start-Sleep -Milliseconds 700
    } catch {}
    return
  }

  $foreign = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($foreign) { throw "La porta $Port e gia occupata da un altro programma." }
}

function Test-FighterServer {
  $json = Get-FighterHealth
  return ($json -and $json.ok -eq $true -and $json.liveBridge -eq 'tiktool-browser-direct-v3' -and $json.keyConfigured -eq $true)
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

  Write-Step 'Scarico una volta il runtime Node.js LTS ufficiale...'
  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  $baseUrl = 'https://nodejs.org/dist/latest-v22.x/'
  $manifest = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri ($baseUrl + 'SHASUMS256.txt')).Content
  $match = [regex]::Match($manifest, '(?m)^([0-9a-f]{64})\s+(node-v[^\s]+-win-x64\.zip)\s*$')
  if (-not $match.Success) { throw 'Impossibile trovare il runtime Node.js Windows x64.' }

  $expectedHash = $match.Groups[1].Value.ToLowerInvariant()
  $fileName = $match.Groups[2].Value
  $zipPath = Join-Path $RuntimeRoot $fileName
  $extractDir = Join-Path $RuntimeRoot 'node-extract'
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri ($baseUrl + $fileName) -OutFile $zipPath

  $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw 'Verifica SHA256 del runtime Node.js fallita.' }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
  $nodeExe = Get-ChildItem -LiteralPath $extractDir -Filter node.exe -Recurse -File | Select-Object -First 1
  if (-not $nodeExe) { throw 'node.exe non trovato dopo l estrazione.' }
  Remove-Item -LiteralPath $PortableNodeDir -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $nodeExe.Directory.FullName -Destination $PortableNodeDir
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path -LiteralPath $PortableNode)) { throw 'Runtime Node.js locale incompleto.' }
  return $PortableNode
}

try {
  Write-Step "Cartella gioco: $PackageRoot"
  if (-not (Test-Path -LiteralPath $ServerFile)) { throw 'Pacchetto incompleto: manca web-safe-server.mjs.' }
  if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot 'desktop-live.html'))) { throw 'Pacchetto incompleto: manca desktop-live.html.' }

  $TikToolKey = Get-TikToolApiKey
  $env:TIKTOOL_API_KEY = $TikToolKey
  $NodeExe = Get-NodeExecutable
  Stop-OldRuntime

  Write-Step 'Avvio Fighter Arena con TikTool browser-direct...'
  Start-Process -FilePath $NodeExe -ArgumentList @('web-safe-server.mjs') -WorkingDirectory $PackageRoot -WindowStyle Hidden

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-FighterServer) { $ready = $true; break }
  }
  if (-not $ready) { throw "Fighter Arena non risponde su 127.0.0.1:$Port." }

  Write-Step "Account LIVE: @$LiveUser"
  Write-Step 'TikFinity e bridge eventi NON necessari.'
  $programFiles = [Environment]::GetEnvironmentVariable('ProgramFiles')
  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $browserCandidates = @(
    $(if ($programFilesX86) { Join-Path $programFilesX86 'Microsoft\Edge\Application\msedge.exe' }),
    $(if ($programFiles) { Join-Path $programFiles 'Microsoft\Edge\Application\msedge.exe' }),
    $(if ($programFiles) { Join-Path $programFiles 'Google\Chrome\Application\chrome.exe' }),
    $(if ($programFilesX86) { Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe' })
  )
  $browser = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if ($browser) { Start-Process -FilePath $browser -ArgumentList @("--app=$LiveUrl", '--start-maximized') }
  else { Start-Process $LiveUrl }

  Write-Host ''
  Write-Host '[OK] Fighter Arena TikTool DIRECT avviata.' -ForegroundColor Green
  Write-Host '[INFO] GIALLO = connessione in corso / LIVE non ancora agganciata.' -ForegroundColor Yellow
  Write-Host '[INFO] VERDE = LIVE agganciata. Il pallino pulsa a ogni interazione ricevuta.' -ForegroundColor Green
  Write-Host '[INFO] ROSSO = errore API/rete/autenticazione.' -ForegroundColor Red
  exit 0
} catch {
  Write-Host ''
  Write-Host ('[ERRORE] ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  Remove-Item Env:TIKTOOL_API_KEY -ErrorAction SilentlyContinue
}
