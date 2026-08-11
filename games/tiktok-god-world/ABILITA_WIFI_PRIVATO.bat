@echo off
setlocal
echo Questa operazione abilita soltanto la porta TCP 8793 sulle reti PRIVATE.
echo Usala solo se Safari non riesce ad aprire l'URL mostrato dal bridge.
pause
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0bridge\enable-firewall.ps1""'"
