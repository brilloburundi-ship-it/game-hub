@echo off
setlocal
set "TOKEN_FILE=%LOCALAPPDATA%\FighterArenaBridge\bridge-token.txt"
if not exist "%TOKEN_FILE%" (
  echo Token bridge non trovato. Avvia prima AVVIA_IPHONE_TIKFINITY.bat.
  pause
  exit /b 1
)
set /p BRIDGE_TOKEN=<"%TOKEN_FILE%"
powershell.exe -NoProfile -Command "$u='http://127.0.0.1:8795/bridge/test?type=join&token=' + [uri]::EscapeDataString('%BRIDGE_TOKEN%'); Invoke-WebRequest -Method Post -Uri $u -UseBasicParsing | Out-Null; Write-Host 'JOIN di test inviato al telefono.' -ForegroundColor Green"
if errorlevel 1 (
  echo Test fallito. Verifica che il bridge sia aperto.
  pause
)
