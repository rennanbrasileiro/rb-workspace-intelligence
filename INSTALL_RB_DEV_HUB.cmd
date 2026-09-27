@echo off
setlocal EnableExtensions
set "ROOT=%USERPROFILE%\RB\Projects"
set "HUB=%ROOT%\rb-workspace-intelligence"

echo ==========================================================
echo   RB DEV HUB - instalacao / atualizacao local
echo ==========================================================
echo.

where git >nul 2>nul || goto :missing_git
where node >nul 2>nul || goto :missing_node

if not exist "%ROOT%" mkdir "%ROOT%"

if exist "%HUB%\.git" (
  echo [1/3] Atualizando RB Workspace Intelligence...
  git -C "%HUB%" pull --ff-only || goto :fail
) else (
  echo [1/3] Clonando RB Workspace Intelligence...
  git clone https://github.com/rennanbrasileiro/rb-workspace-intelligence.git "%HUB%" || goto :fail
)

echo [2/3] Preparando VS Code...
where code >nul 2>nul && start "" code -n "%HUB%\RB.code-workspace"

echo [3/3] Iniciando RB Dev Hub...
cd /d "%HUB%"
start "RB Dev Hub" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4310/devhub/
exit /b 0

:missing_git
echo [ERRO] Git nao encontrado.
echo Instale Git for Windows e rode este arquivo novamente.
echo https://git-scm.com/download/win
pause
exit /b 1

:missing_node
echo [ERRO] Node.js LTS nao encontrado.
echo Instale Node.js LTS e rode este arquivo novamente.
echo https://nodejs.org/
pause
exit /b 1

:fail
echo.
echo [ERRO] O bootstrap nao concluiu. Se o GitHub pedir autenticacao,
echo conclua o login no Git Credential Manager e rode novamente.
pause
exit /b 1
