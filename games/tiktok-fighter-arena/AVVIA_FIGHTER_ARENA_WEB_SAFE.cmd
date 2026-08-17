@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title FIGHTER ARENA - TIKTOOL WEB APP

if not exist "%~dp0START_FIGHTER_ARENA_WEB_SAFE.cmd" (
  echo [ERRORE] START_FIGHTER_ARENA_WEB_SAFE.cmd non trovato.
  echo Esegui INSTALLA_FIGHTER_ARENA_WEB_SAFE.cmd dalla build completa.
  pause
  exit /b 1
)

call "%~dp0START_FIGHTER_ARENA_WEB_SAFE.cmd"
exit /b %ERRORLEVEL%
