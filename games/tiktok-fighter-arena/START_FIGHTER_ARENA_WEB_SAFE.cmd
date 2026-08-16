@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA - WEB DESKTOP SAFE

set "PORT=8777"
set "LIVE_URL=http://127.0.0.1:%PORT%/desktop-live.html"
set "HEALTH_URL=http://127.0.0.1:%PORT%/__health"

if not exist "%~dp0desktop-live.html" (
  echo [ERRORE] desktop-live.html non trovato.
  pause
  exit /b 1
)
if not exist "%~dp0web-safe-server.mjs" (
  echo [ERRORE] web-safe-server.mjs non trovato.
  pause
  exit /b 1
)

set "NODE_EXE="
where node.exe >nul 2>nul && set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo [ERRORE] Node.js non trovato.
  echo Esegui INSTALLA_FIGHTER_ARENA_WEB_SAFE.cmd una volta: installera automaticamente il necessario.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%HEALTH_URL%'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  netstat -ano 2^>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
  if not errorlevel 1 (
    echo [ERRORE] La porta %PORT% e occupata da un altro programma.
    echo Chiudi il processo che usa la porta e riprova.
    pause
    exit /b 1
  )
  start "FIGHTER ARENA WEB SAFE SERVER" /min "%NODE_EXE%" "%~dp0web-safe-server.mjs"
)

for /L %%I in (1,1,20) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%HEALTH_URL%'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto :server_ready
  timeout /t 1 /nobreak >nul
)

echo [ERRORE] Il server locale WEB SAFE non risponde.
pause
exit /b 1

:server_ready
set "BROWSER_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined BROWSER_EXE (
  start "" "%BROWSER_EXE%" --app="%LIVE_URL%" --start-maximized
) else (
  start "" "%LIVE_URL%"
)

>"%~dp0URL_FIGHTER_ARENA_LIVE.txt" echo %LIVE_URL%
echo.
echo [OK] Fighter Arena WEB SAFE avviata.
echo [OK] TikFinity e LIVE Studio non vengono avviati, chiusi o controllati.
echo [OK] Un solo client Event API viene aperto dal gioco dopo il preload.
echo.
exit /b 0
