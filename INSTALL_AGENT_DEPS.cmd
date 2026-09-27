@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul || (echo [ERRO] Python nao encontrado.& pause & exit /b 1)
python -m pip install -r requirements.txt --user
pause
