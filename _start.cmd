@echo off
cd /d "%~dp0"
taskkill /F /IM python.exe >nul 2>&1
python -m http.server 3000
