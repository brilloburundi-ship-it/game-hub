@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA LIVE - TIKFINITY DIRECT

set "PORT="
for /L %%P in (8765,1,8785) do (
  netstat -ano 2^>nul | findstr /R /C:":%%P .*LISTENING" >nul 2>nul
  if errorlevel 1 (
    set "PORT=%%P"
    goto :port_found
  )
)

:port_found
if not defined PORT set "PORT=8790"
set "LIVE_URL=http://127.0.0.1:%PORT%/index.html"
>"URL_FIGHTER_ARENA_LIVE.txt" echo %LIVE_URL%

set "PYMODE="
py -3 -c "import sys; print(sys.version_info[0])" >nul 2>nul
if not errorlevel 1 set "PYMODE=PY"
if not defined PYMODE (
  python -c "import sys; print(sys.version_info[0])" >nul 2>nul
  if not errorlevel 1 set "PYMODE=PYTHON"
)

if not defined PYMODE (
  echo.
  echo Python non trovato. Fighter Arena usa moduli ES e deve essere servito via HTTP locale.
  echo Installa Python 3 e riprova.
  pause
  exit /b 1
)

echo ============================================
echo   FIGHTER ARENA LIVE - DIRECT TIKFINITY
echo ============================================
echo.
echo TikFinity Desktop deve essere aperto sul PC.
echo Event API: ws://localhost:21213/
echo Fighter Arena: %LIVE_URL%
echo.

if /I "%PYMODE%"=="PY" (
  start "FIGHTER ARENA LOCAL SERVER" /min py -3 -m http.server %PORT% --bind 127.0.0.1
) else (
  start "FIGHTER ARENA LOCAL SERVER" /min python -m http.server %PORT% --bind 127.0.0.1
)

for /L %%I in (1,1,12) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%LIVE_URL%'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto :server_ready
  timeout /t 1 /nobreak >nul
)

echo Il server locale non risponde.
pause
exit /b 1

:server_ready
start "" "%LIVE_URL%"
echo.
echo Connessione LIVE: browser -^> ws://localhost:21213/ -^> TikFinity
echo Nessun passaggio Game Hub e nessun bridge 8795 in modalita PC.
echo URL salvato in URL_FIGHTER_ARENA_LIVE.txt
echo Lascia TikFinity Desktop aperto durante la LIVE.
exit /b 0
