@echo off
setlocal EnableExtensions
set "ROOT=%USERPROFILE%\RB\Projects"
set "HUB=%ROOT%\rb-workspace-intelligence"
set "MOLDE=%ROOT%\molde-3d-app"

echo ==========================================================
echo   RB DEV HUB - instalacao / atualizacao local
echo ==========================================================
echo.

where git >nul 2>nul || goto :missing_git
where node >nul 2>nul || goto :missing_node

if not exist "%ROOT%" mkdir "%ROOT%"

echo [1/5] RB Workspace Intelligence...
if exist "%HUB%\.git" (
  git -C "%HUB%" pull --ff-only || goto :fail
) else (
  git clone https://github.com/rennanbrasileiro/rb-workspace-intelligence.git "%HUB%" || goto :fail
)

echo [2/5] MOLDÊ...
if exist "%MOLDE%\.git" (
  git -C "%MOLDE%" pull --ff-only || echo [AVISO] Nao foi possivel atualizar o MOLDÊ agora.
) else (
  git clone https://github.com/rennanbrasileiro/molde-3d-app.git "%MOLDE%" || echo [AVISO] MOLDÊ e privado. Autentique o GitHub e use o botao Clonar no Dev Hub.
)

echo [3/5] Validando MOLDÊ quando disponivel...
if exist "%MOLDE%\package.json" (
  pushd "%MOLDE%"
  call npm run build || (popd & echo [ERRO] O build lacrado do MOLDÊ falhou. Nenhuma versao foi executada.& pause & exit /b 1)
  popd
)

echo [4/5] Preparando VS Code...
where code >nul 2>nul && start "" code -n "%HUB%\RB.code-workspace"

echo [5/5] Iniciando RB Dev Hub...
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
