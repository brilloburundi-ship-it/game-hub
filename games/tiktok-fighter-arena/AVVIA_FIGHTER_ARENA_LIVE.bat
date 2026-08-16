@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA LIVE - WEB SAFE

set "PORT=8777"
set "LIVE_URL=http://127.0.0.1:%PORT%/desktop-live.html"
set "HEALTH_URL=http://127.0.0.1:%PORT%/__health"
>"URL_FIGHTER_ARENA_LIVE.txt" echo %LIVE_URL%

echo ============================================
echo   FIGHTER ARENA LIVE - WEB DESKTOP SAFE
echo ============================================
echo.
echo NON avvia o chiude TikFinity.
echo NON usa il bridge 8795.
echo NON controlla TikTok LIVE Studio.
echo Apre un solo client Event API DOPO il preload.
echo.
echo 1. LIVE Studio deve essere gia LIVE.
echo 2. TikFinity deve essere gia collegato e stabile.
echo 3. Poi usa questa WEB DESKTOP.
echo.

if not exist "%~dp0desktop-live.html" (
  echo [ERRORE] Manca desktop-live.html nella stessa cartella.
  pause
  exit /b 1
)
if not exist "%~dp0web-safe-server.mjs" (
  echo [ERRORE] Manca web-safe-server.mjs nella stessa cartella.
  pause
  exit /b 1
)

set "NODE_EXE="
where node.exe >nul 2>nul && set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo [ERRORE] Node.js non trovato.
  echo Questa build usa solo un piccolo server HTTP locale, senza bridge TikFinity.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%HEALTH_URL%'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto :server_ready

netstat -ano 2^>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [ERRORE] La porta %PORT% e gia occupata da un altro programma.
  echo Chiudi il processo che usa la porta %PORT% e riprova.
  pause
  exit /b 1
)

start "FIGHTER ARENA WEB SAFE SERVER" /min "%NODE_EXE%" "%~dp0web-safe-server.mjs"

for /L %%I in (1,1,20) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%HEALTH_URL%'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto :server_ready
  timeout /t 1 /nobreak >nul
)

echo [ERRORE] Il server locale WEB SAFE non risponde.
echo Controlla che Node.js sia installato e che la porta %PORT% non sia bloccata.
pause
exit /b 1

:server_ready
start "" "%LIVE_URL%"
echo.
echo [OK] WEB SAFE avviata: %LIVE_URL%
echo [OK] TikFinity e LIVE Studio restano indipendenti.
echo [OK] Nessun reconnect automatico aggressivo.
echo.
exit /b 0
