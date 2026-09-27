@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================================
echo   RB WORKSPACE INTELLIGENCE - ATUALIZACAO SEGURA
echo ============================================================
echo.

where git >nul 2>nul || (echo [ERRO] Git nao encontrado.& pause & exit /b 1)
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado.& pause & exit /b 1)

set "DIRTY="
for /f "delims=" %%A in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  echo [1/5] Alteracoes locais encontradas. Criando backup Git stash...
  git stash push -u -m "RB automatic backup before update" || (echo [ERRO] Nao foi possivel preservar as alteracoes locais.& pause & exit /b 1)
) else (
  echo [1/5] Nenhuma alteracao local pendente.
)

echo [2/5] Atualizando codigo oficial...
git pull --ff-only || (echo [ERRO] git pull falhou. Seu backup local permanece preservado no stash.& pause & exit /b 1)

echo [3/5] Validando build...
call npm run build || (echo [ERRO] O build falhou. Veja a mensagem acima.& pause & exit /b 1)

echo [4/5] Encerrando instancia anterior da porta 4310...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4310 .*LISTENING"') do taskkill /PID %%P /F >nul 2>nul

echo [5/5] Iniciando a versao atualizada...
start "" "%~dp0START_RB_WORKSPACE.cmd"

echo.
echo Atualizacao concluida.
if defined DIRTY (
  echo Suas alteracoes locais antigas foram preservadas no Git stash.
  echo Para consultar depois: git stash list
)
exit /b 0
