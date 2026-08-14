@echo off
setlocal
cd /d "%~dp0"
echo Richiesta autorizzazione amministratore per la sola porta TCP 8795 su rete privata...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0bridge\enable-firewall.ps1""'"
