@echo off
echo Starting PaperAgent development environment...

:: Check whether Electron is installed.
npm list -g electron >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo Installing Electron globally...
  npm install -g electron
)

:: Start the app.
echo Launching PaperAgent...
electron . --dev
