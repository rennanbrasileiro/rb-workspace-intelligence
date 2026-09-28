@echo off
setlocal EnableExtensions
set "BOOT=%TEMP%\rbwi-bootstrap-%RANDOM%.ps1"
echo Baixando o instalador oficial do RB Workspace Intelligence...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/rennanbrasileiro/rb-workspace-intelligence/main/tools/BOOTSTRAP_RB_WORKSPACE.ps1' -OutFile '%BOOT%'"
if errorlevel 1 (
  echo.
  echo [ERRO] Nao foi possivel baixar o bootstrap oficial.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BOOT%"
set "ERR=%ERRORLEVEL%"
del "%BOOT%" >nul 2>nul
if not "%ERR%"=="0" (
  echo.
  echo [ERRO] Instalacao nao concluida.
  pause
  exit /b %ERR%
)
echo.
echo Instalacao concluida. Use apenas o atalho "RB Workspace Intelligence" na Area de Trabalho.
pause
endlocal
