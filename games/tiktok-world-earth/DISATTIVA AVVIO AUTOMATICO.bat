@echo off
setlocal EnableExtensions
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TikTok World Earth V10.3 Bridge.lnk"
if exist "%LINK%" del /q "%LINK%"
echo.
echo Avvio automatico di TikTok World Earth V10.3 disattivato.
echo Gli altri bridge non sono stati modificati.
timeout /t 3 /nobreak >nul
