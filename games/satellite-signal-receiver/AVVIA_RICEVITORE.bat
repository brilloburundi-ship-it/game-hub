@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul || (
  echo Python non trovato. Installa Python 3.11 o superiore e riprova.
  pause
  exit /b 1
)
if not exist .venv\Scripts\python.exe (
  echo [SETUP] Creo ambiente locale...
  py -m venv .venv
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)
echo [START] Collega RTL-SDR e antenna, poi si aprira' il browser.
python receiver_bridge.py
pause
