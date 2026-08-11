@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall show rule name="TikTok World Bridge WiFi" >nul 2>&1
if "%errorlevel%"=="0" (
  netsh advfirewall firewall set rule name="TikTok World Bridge WiFi" new localport=4187,21347 profile=any remoteip=localsubnet >nul
  goto ready
)
netsh advfirewall firewall add rule name="TikTok World Bridge WiFi" dir=in action=allow protocol=TCP localport=4187,21347 profile=any remoteip=localsubnet
:ready
echo.
echo Bridge abilitato solo sulle porte 4187 e 21347 e solo dalla rete locale.
echo Il profilo Wi-Fi e gli altri bridge non sono stati modificati.
echo Ora avvia AVVIA GIOCO.bat e usa l'URL mostrato.
pause
