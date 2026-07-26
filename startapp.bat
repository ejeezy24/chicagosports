@echo off
REM Double-click launcher for Windows. Batch files are not affected by the
REM PowerShell execution policy that blocks npm.ps1, and npm.cmd sidesteps the
REM PowerShell wrapper entirely.

cd /d "%~dp0"
title Chicago Sports

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this PC.
  echo Install the LTS build from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist package.json (
  echo.
  echo This file needs to sit inside the chicago-sports folder,
  echo next to package.json. Move it there and run it again.
  echo.
  pause
  exit /b 1
)

echo.
echo === Installing dependencies. The first run takes a minute. ===
echo.
call npm.cmd install
if errorlevel 1 (
  echo.
  echo Install failed. Copy the text above and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo === Starting the app at http://localhost:5173 ===
echo === Your browser opens automatically in a few seconds. ===
echo === Leave this window open. Press Ctrl+C to stop. ===
echo.

start "" cmd /c "timeout /t 12 >nul & explorer http://localhost:5173"
call npm.cmd run dev

pause
