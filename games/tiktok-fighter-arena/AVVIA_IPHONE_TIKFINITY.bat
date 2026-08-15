@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Fighter Arena - Safari + TikFinity - Porta 8766

set "PORT=8766"
set "FIGHTER_ARENA_PORT=8766"
set "FIGHTER_ARENA_TOKEN=DU0r2ET4_ZFQV_uwdbyX5GQw86x9pT_N"

set "NODE_EXE="
where node.exe >nul 2>nul && set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=C:\Users\kevin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo Node.js 22 o superiore non trovato.
  echo Installa Node.js LTS e riprova.
  pause
  exit /b 1
)

"%NODE_EXE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo Fighter Arena bridge richiede Node.js 22 o superiore.
  "%NODE_EXE%" --version
  pause
  exit /b 1
)

echo ============================================
echo   FIGHTER ARENA - SAFARI + TIKFINITY
 echo ============================================
echo.
echo Libero la porta %PORT% dal vecchio server locale...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($pid in $pids){ try { Stop-Process -Id $pid -Force -ErrorAction Stop; Write-Host ('Chiuso vecchio processo PID ' + $pid) } catch { Write-Host ('Impossibile chiudere PID ' + $pid) } }" 2>nul
ping 127.0.0.1 -n 2 >nul

echo Avvio Fighter Arena sulla porta %PORT%...
echo TikFinity Desktop deve essere gia aperto oppure puo essere aperto subito dopo.
echo.
"%NODE_EXE%" bridge\server.mjs
if errorlevel 1 pause
