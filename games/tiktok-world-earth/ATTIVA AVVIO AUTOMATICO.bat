@echo off
setlocal EnableExtensions
powershell.exe -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\TikTok World Earth V10.3 Bridge.lnk')); $s.TargetPath='%SystemRoot%\System32\wscript.exe'; $s.Arguments='""%~dp0autostart.vbs""'; $s.WorkingDirectory='%~dp0'; $s.Description='TikTok World Earth V10.3 - bridge Wi-Fi 4187/21347'; $s.Save()"
if errorlevel 1 (
  echo Impossibile attivare l'avvio automatico.
  pause
  exit /b 1
)
start "" wscript.exe "%~dp0autostart.vbs"
echo.
echo Avvio automatico attivato senza modificare gli altri bridge.
echo Da ora bastano PC acceso e stesso Wi-Fi.
timeout /t 3 /nobreak >nul
