@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA - TIKTOOL DIRECT

set "LAUNCHER=%~dp0one-start-tiktool.ps1"
if not exist "%LAUNCHER%" set "LAUNCHER=%~dp0_system\one-start-tiktool.ps1"

if not exist "%LAUNCHER%" (
  echo [ERRORE] Pacchetto incompleto: manca one-start-tiktool.ps1
  echo Estrai tutto lo ZIP in una cartella e avvia questo file senza spostarlo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%"
if errorlevel 1 (
  echo.
  echo [ERRORE] Fighter Arena non e stato avviato.
  pause
  exit /b 1
)
exit /b 0
