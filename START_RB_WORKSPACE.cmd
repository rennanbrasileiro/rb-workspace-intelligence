@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado.& pause & exit /b 1)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4310 .*LISTENING"') do set "RBPID=%%P"
if defined RBPID goto :open
start "RB Workspace Intelligence" /min cmd /c "node server.mjs"
timeout /t 2 /nobreak >nul
:open
start "" http://127.0.0.1:4310/
exit /b 0
