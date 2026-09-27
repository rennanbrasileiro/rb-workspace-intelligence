@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul || (echo [ERRO] Python nao encontrado. Instale Python 3.11+ e marque Add Python to PATH.& pause & exit /b 1)
python -m pip install --upgrade pip
python -m pip install -r agent\requirements.txt
if errorlevel 1 (echo [ERRO] Falha ao instalar dependencias.& pause & exit /b 1)
echo.
echo Dependencias do Document Intelligence instaladas com sucesso.
pause
