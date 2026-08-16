@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title INSTALLA FIGHTER ARENA WEB SAFE

if not exist "%~dp0install-web-safe.ps1" (
  echo [ERRORE] install-web-safe.ps1 non trovato nella stessa cartella.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-web-safe.ps1" -SourceDir "%~dp0"
if errorlevel 1 (
  echo.
  echo [ERRORE] Installazione non completata.
  pause
  exit /b 1
)

exit /b 0
