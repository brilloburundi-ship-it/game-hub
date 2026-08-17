@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA - TIKTOOL

if not exist "%~dp0_system\one-start-tiktool.ps1" (
  echo [ERRORE] Pacchetto incompleto: manca _system\one-start-tiktool.ps1
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_system\one-start-tiktool.ps1" -PackageRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo [ERRORE] Fighter Arena non e stato avviato.
  pause
  exit /b 1
)
exit /b 0
