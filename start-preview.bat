@echo off
cd /d "%~dp0"
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%
echo Starting preview server at http://localhost:4173
start "" "http://localhost:4173"
call npm.cmd run preview -- --host --port 4173
