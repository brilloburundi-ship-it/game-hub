param([switch]$ApriBrowser)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$httpPort = 4187
$bridgePort = 21347
$tikFinityPort = 21213

$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.webp'='image/webp'; '.opus'='audio/ogg'; '.ogg'='audio/ogg';
  '.mp3'='audio/mpeg'; '.svg'='image/svg+xml'; '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.woff2'='font/woff2'
}

$lanIp = $null
try {
  # This discovers the active route without sending data and avoids the very
  # slow Get-NetIPAddress query seen on some low-end Windows installations.
  $routeProbe = [Net.Sockets.Socket]::new(
    [Net.Sockets.AddressFamily]::InterNetwork,
    [Net.Sockets.SocketType]::Dgram,
    [Net.Sockets.ProtocolType]::Udp
  )
  $routeProbe.Connect('8.8.8.8', 53)
  $lanIp = ([Net.IPEndPoint]$routeProbe.LocalEndPoint).Address.IPAddressToString
  $routeProbe.Dispose()
} catch {
  try {
    $lanIp = [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) |
      Where-Object { $_.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and $_.IPAddressToString -notmatch '^(127\.|169\.254\.)' } |
      Select-Object -First 1 -ExpandProperty IPAddressToString
  } catch {}
}
if (-not $lanIp) { $lanIp = '127.0.0.1' }
$gameUrl = "http://${lanIp}:${httpPort}/?build=7"

# Raw TCP relay: the phone connects here while TikFinity remains local on the PC.
$bridgeJob = Start-Job -ArgumentList $bridgePort,$tikFinityPort -ScriptBlock {
  param($listenPort,$targetPort)
  $relay = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any,$listenPort)
  $relay.Start()
  try {
    while ($true) {
      $phone = $relay.AcceptTcpClient()
      $tikfinity = $null
      try {
        $tikfinity = [Net.Sockets.TcpClient]::new()
        $tikfinity.Connect('127.0.0.1',$targetPort)
        $fromPhone = $phone.GetStream(); $fromTikfinity = $tikfinity.GetStream()
        $up = $fromPhone.CopyToAsync($fromTikfinity); $down = $fromTikfinity.CopyToAsync($fromPhone)
        [Threading.Tasks.Task]::WhenAny($up,$down).GetAwaiter().GetResult() | Out-Null
      } catch {
        # TikFinity may be closed; the game will retry automatically.
      } finally {
        if ($tikfinity) { $tikfinity.Dispose() }
        $phone.Dispose()
      }
    }
  } finally { $relay.Stop() }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any,$httpPort)
$listener.Start()

$urlText = @"
TIKTOK WORLD - URL UNICO TELEFONO

$gameUrl

1. PC e telefono devono essere sullo stesso Wi-Fi.
2. Il bridge parte automaticamente dopo l'accesso a Windows.
3. Sul telefono apri l'indirizzo sopra e usa Aggiungi alla schermata Home.
4. Se Windows cambia indirizzo IP, riapri questo file e aggiorna l'icona Safari.
"@
Set-Content -LiteralPath (Join-Path $root 'URL TELEFONO.txt') -Value $urlText -Encoding UTF8

Clear-Host
Write-Host 'TIKTOK WORLD - BRIDGE WIFI ATTIVO' -ForegroundColor Yellow
Write-Host "URL UNICO: $gameUrl" -ForegroundColor Green
Write-Host "TikFinity relay: porta $bridgePort -> localhost:$tikFinityPort" -ForegroundColor DarkGray
Write-Host 'Lascia aperta questa finestra. Premi Ctrl+C per chiudere.'
if ($ApriBrowser) { Start-Process $gameUrl }

function Send-Response {
  param($Client,$Method,$Status,$Reason,$ContentType,$FilePath,$Start,$End,$Total)
  $stream = $Client.GetStream()
  $count = [int64]($End - $Start + 1)
  $headers = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $count`r`nAccept-Ranges: bytes`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`n"
  if ($Status -eq 206) { $headers += "Content-Range: bytes $Start-$End/$Total`r`n" }
  if ([IO.Path]::GetFileName($FilePath) -in @('index.html','service-worker.js') -or [IO.Path]::GetExtension($FilePath).ToLowerInvariant() -in @('.js','.css','.webmanifest')) {
    $headers += "Cache-Control: no-store, no-cache, must-revalidate`r`nPragma: no-cache`r`nExpires: 0`r`n"
  } else {
    $headers += "Cache-Control: public, max-age=3600`r`n"
  }
  $headers += "`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
  $stream.Write($headerBytes,0,$headerBytes.Length)
  if ($Method -ne 'HEAD') {
    $file = [IO.File]::OpenRead($FilePath)
    try {
      [void]$file.Seek($Start,[IO.SeekOrigin]::Begin)
      $buffer = New-Object byte[] 65536; $remaining = $count
      while ($remaining -gt 0) {
        $read = $file.Read($buffer,0,[Math]::Min($buffer.Length,$remaining))
        if ($read -le 0) { break }
        $stream.Write($buffer,0,$read); $remaining -= $read
      }
    } finally { $file.Dispose() }
  }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 10000; $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream,[Text.Encoding]::ASCII,$false,8192,$true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      $parts = $requestLine.Split(' '); $method = $parts[0].ToUpperInvariant(); $target = $parts[1]
      $headers = @{}
      while (($line = $reader.ReadLine()) -ne '') {
        $cut = $line.IndexOf(':'); if ($cut -gt 0) { $headers[$line.Substring(0,$cut).Trim().ToLowerInvariant()] = $line.Substring($cut+1).Trim() }
      }
      if ($method -notin @('GET','HEAD')) { continue }
      $path = [Uri]::UnescapeDataString(([Uri]("http://local" + $target)).AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
      $candidate = [IO.Path]::GetFullPath((Join-Path $root $path))
      $rootPrefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
      if (-not $candidate.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $body = [Text.Encoding]::UTF8.GetBytes('404 Not Found'); $reply = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"); $stream.Write($reply,0,$reply.Length); if ($method -ne 'HEAD') { $stream.Write($body,0,$body.Length) }; continue
      }
      $ext = [IO.Path]::GetExtension($candidate).ToLowerInvariant(); $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $length = (Get-Item -LiteralPath $candidate).Length; $start = [int64]0; $end = [int64]($length-1); $status = 200; $reason = 'OK'
      if ($headers.ContainsKey('range') -and $headers['range'] -match '^bytes=(\d+)-(\d*)$') {
        $start = [int64]$Matches[1]; if ($Matches[2]) { $end = [Math]::Min([int64]$Matches[2],$end) }
        if ($start -lt $length -and $end -ge $start) { $status=206; $reason='Partial Content' } else { continue }
      }
      Send-Response -Client $client -Method $method -Status $status -Reason $reason -ContentType $type -FilePath $candidate -Start $start -End $end -Total $length
    } catch [IO.IOException] {
      # A phone/browser may cancel a request; the server remains active.
    } finally { $client.Dispose() }
  }
} finally {
  $listener.Stop()
  Stop-Job -Job $bridgeJob -ErrorAction SilentlyContinue
  Remove-Job -Job $bridgeJob -Force -ErrorAction SilentlyContinue
}
