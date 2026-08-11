@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TikTok World - Bridge Wi-Fi

rem Se il bridge automatico e' gia attivo, non ne avvia una seconda copia.
powershell.exe -NoProfile -Command "$c=[Net.Sockets.TcpClient]::new(); try{$c.Connect('127.0.0.1',4187); exit 0}catch{exit 1}finally{$c.Dispose()}" >nul 2>&1
if not errorlevel 1 (
  if /I not "%~1"=="--no-open" powershell.exe -NoProfile -Command "$u=(Select-String -LiteralPath '%~dp0URL TELEFONO.txt' -Pattern '^http://' | Select-Object -First 1).Line; if($u){Start-Process $u}" >nul 2>&1
  exit /b 0
)

where node.exe >nul 2>&1
if errorlevel 1 goto powershell_fallback
node.exe "%~dp0server.cjs" %*
goto end
:powershell_fallback
if /I "%~1"=="--no-open" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -ApriBrowser
)
:end
if /I not "%~1"=="--no-open" pause
