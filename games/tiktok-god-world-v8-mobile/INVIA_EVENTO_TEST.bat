@echo off
setlocal
set "TOKEN_FILE=%LOCALAPPDATA%\TikTokGodWorldPixelBridge\bridge-token.txt"
if not exist "%TOKEN_FILE%" (
  echo Avvia prima AVVIA_SAFARI_TIKFINITY.bat.
  pause
  exit /b 1
)
set /p BRIDGE_TOKEN=<"%TOKEN_FILE%"
powershell.exe -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:8793/bridge/test?type=comment^&token=' + [uri]::EscapeDataString('%BRIDGE_TOKEN%')) | Out-Null"
if errorlevel 1 (
  echo Test fallito. Controlla che il bridge sia aperto.
) else (
  echo Evento JOIN di prova inviato a Safari.
)
pause
