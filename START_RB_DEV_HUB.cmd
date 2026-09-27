@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERRO] Node.js LTS nao encontrado.& echo Instale Node.js LTS e execute novamente.& pause & exit /b 1)
where code >nul 2>nul && start "" code -n "%cd%\RB.code-workspace"
start "" http://127.0.0.1:4310/devhub/
node server.mjs
