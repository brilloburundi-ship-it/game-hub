@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA LIVE - WEB SAFE

set "PORT=8777"
set "LIVE_URL=http://127.0.0.1:%PORT%/desktop-live.html"
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
echo   FIGHTER ARENA LIVE - WEB SAFE
 echo ============================================
echo.
echo Questa versione NON avvia, chiude o riconnette TikFinity.
echo NON usa bridge 8795 e NON tocca TikTok LIVE Studio.
echo Il gioco apre UN SOLO client Event API dopo il preload completo.
echo Event API: ws://127.0.0.1:21213/
echo Fighter Arena: %LIVE_URL%
echo.
echo Prima collega TikFinity alla LIVE e lascialo stabile.
echo Poi usa questa finestra per aprire Fighter Arena.
echo.

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%LIVE_URL%'; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto :server_ready

netstat -ano 2^>nul | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo La porta %PORT% e gia occupata da un altro programma.
  echo Chiudi il programma che usa la porta e riprova.
  pause
  exit /b 1
)

if /I "%PYMODE%"=="PY" (
  start "FIGHTER ARENA WEB SAFE SERVER" /min py -3 -m http.server %PORT% --bind 127.0.0.1
) else (
  start "FIGHTER ARENA WEB SAFE SERVER" /min python -m http.server %PORT% --bind 127.0.0.1
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
echo WEB SAFE avviata.
echo TikFinity resta indipendente dalla LIVE Studio.
echo Nessun reconnect automatico aggressivo: se Event API cade, usa RECONNECT TIKFINITY nella schermata del gioco.
echo URL salvato in URL_FIGHTER_ARENA_LIVE.txt
echo.
exit /b 0
