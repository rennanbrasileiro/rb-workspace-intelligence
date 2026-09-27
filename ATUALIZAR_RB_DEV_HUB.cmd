@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ==========================================================
echo   RB DEV HUB - atualizar e reiniciar
echo ==========================================================
echo.
where git >nul 2>nul || (echo [ERRO] Git nao encontrado.& pause & exit /b 1)
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado.& pause & exit /b 1)
echo [1/2] Atualizando codigo...
git pull --ff-only || (echo [ERRO] Nao foi possivel atualizar.& pause & exit /b 1)
echo [2/2] Iniciando Hub atualizado...
start "RB Dev Hub" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4310/devhub/
exit /b 0
