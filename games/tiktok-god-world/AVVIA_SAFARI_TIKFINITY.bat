@echo off
setlocal
cd /d "%~dp0"
title TikTok God World - Safari + TikFinity Bridge - Porta 8793
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
"%NODE_EXE%" bridge\server.mjs
if errorlevel 1 pause
