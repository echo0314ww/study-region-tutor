@echo off
setlocal

set "ROOT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%scripts\open-dev-tabs.ps1"

if errorlevel 1 (
  echo.
  echo Failed to open development tabs.
  pause
  exit /b %errorlevel%
)

endlocal
