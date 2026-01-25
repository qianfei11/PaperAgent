@echo off
echo Starting PaperAgent development environment...

:: 检查是否安装了electron
npm list -g electron >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo Installing Electron globally...
  npm install -g electron
)

:: 启动应用
echo Launching PaperAgent...
electron . --dev