@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo RB Workspace Intelligence - atualizacao manual de contingencia
git status --short --branch
git pull --ff-only || (echo [ERRO] Nao foi possivel atualizar.& pause & exit /b 1)
call npm run build || (echo [ERRO] A validacao falhou.& pause & exit /b 1)
echo.
echo Atualizado. Feche a instancia anterior se estiver aberta e execute START_RB_WORKSPACE.cmd.
pause
