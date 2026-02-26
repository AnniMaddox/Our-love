@echo off
cd /d "%~dp0"

set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /R /C:":5173 .*LISTENING"') do (
  set "PORT_PID=%%P"
)

if defined PORT_PID (
  echo [ERROR] Port 5173 is already in use by PID %PORT_PID%.
  echo Please close that process first, then run start-dev.bat again.
  echo Tip: taskkill /PID %PORT_PID% /F
  pause
  exit /b 1
)

echo Starting dev server at http://localhost:5173
start "" "http://localhost:5173"
call npm.cmd run dev -- --host --port 5173 --strictPort
