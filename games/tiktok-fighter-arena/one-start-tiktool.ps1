param(
  [string]$PackageRoot = $PSScriptRoot
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
$SecretDir = Join-Path $env:LOCALAPPDATA 'FighterArena'
$SecretFile = Join-Path $SecretDir 'tiktool-key.dpapi'

function Write-Step([string]$Text) {
  Write-Host "[Fighter Arena] $Text" -ForegroundColor Cyan
}

function Convert-SecureStringToPlain([Security.SecureString]$Secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Get-TikToolApiKey {
  $fromEnv = [string]$env:TIKTOOL_API_KEY
  if (-not [string]::IsNullOrWhiteSpace($fromEnv)) {
    Write-Step 'TikTool API key ricevuta dall ambiente.'
    return $fromEnv.Trim()
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
      Write-Step 'La chiave TikTool salvata non e piu leggibile: verra richiesta di nuovo.'
      Remove-Item -LiteralPath $SecretFile -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host ''
  Write-Host 'PRIMA CONFIGURAZIONE TIKTOOL' -ForegroundColor Yellow
  Write-Host 'Incolla la tua API key TikTool. Verra salvata cifrata per questo utente Windows.' -ForegroundColor Yellow
  $secureInput = Read-Host 'TikTool API key' -AsSecureString
  $plainInput = Convert-SecureStringToPlain $secureInput
  if ([string]::IsNullOrWhiteSpace($plainInput)) {
    throw 'TikTool API key non inserita.'
  }

  New-Item -ItemType Directory -Path $SecretDir -Force | Out-Null
  $encrypted = ConvertFrom-SecureString $secureInput
  Set-Content -LiteralPath $SecretFile -Value $encrypted -Encoding ASCII
  Write-Step 'API key salvata cifrata con Windows DPAPI.'
  return $plainInput.Trim()
}

function Get-FighterHealth {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $HealthUrl
    if ($response.StatusCode -ne 200) { return $null }
    return ($response.Content | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Test-FighterServer {
  $json = Get-FighterHealth
  if (-not $json) { return $false }
  return (
    $json.ok -eq $true -and
    $json.liveBridge -eq 'tiktool-cloud-direct' -and
    $json.keyConfigured -eq $true
  )
}

function Stop-StaleFighterServer {
  $json = Get-FighterHealth
  if (-not $json -or $json.app -ne 'fighter-arena-web-safe') { return }

  if ($json.liveBridge -eq 'tiktool-cloud-direct' -and $json.keyConfigured -eq $true) { return }

  Write-Step 'Chiudo il vecchio runtime Fighter Arena sulla porta 8777...'
  try {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    foreach ($listener in $listeners) {
      if ($listener.OwningProcess -and $listener.OwningProcess -ne $PID) {
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
    Start-Sleep -Milliseconds 700
  } catch {
    throw 'Vecchio server Fighter Arena rilevato ma non riesco a chiuderlo. Chiudi le vecchie finestre Fighter Arena e riprova.'
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

  $TikToolKey = Get-TikToolApiKey
  $env:TIKTOOL_API_KEY = $TikToolKey
  $NodeExe = Get-NodeExecutable

  Stop-StaleFighterServer

  if (-not (Test-FighterServer)) {
    Write-Step 'Avvio Fighter Arena + autenticazione TikTool diretta...'
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
    Write-Step 'Runtime Fighter Arena gia attivo.'
  }

  Write-Step "Account LIVE configurato: @$LiveUser"
  Write-Step 'TikFinity: NON necessario. Bridge eventi: NON necessario.'
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
  Write-Host '[OK] Fighter Arena avviata con TikTool cloud diretto.' -ForegroundColor Green
  Write-Host "[OK] Account monitorato: @$LiveUser" -ForegroundColor Green
  Write-Host '[INFO] GIALLO = account offline/ricerca LIVE.' -ForegroundColor Yellow
  Write-Host '[INFO] VERDE = LIVE trovata e WebSocket collegato.' -ForegroundColor Green
  Write-Host '[INFO] ROSSO = problema API/rete/autenticazione.' -ForegroundColor Red
  exit 0
} catch {
  Write-Host ''
  Write-Host ('[ERRORE] ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  Remove-Item Env:TIKTOOL_API_KEY -ErrorAction SilentlyContinue
}
