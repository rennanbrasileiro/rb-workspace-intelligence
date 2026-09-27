@echo off
setlocal EnableExtensions
set "APP=%USERPROFILE%\RB\Projects\rb-workspace-intelligence"
set "BOOT=%TEMP%\rbwi-install-%RANDOM%.ps1"
>"%BOOT%" echo $ErrorActionPreference='Stop'
>>"%BOOT%" echo function Has($c){return [bool](Get-Command $c -ErrorAction SilentlyContinue)}
>>"%BOOT%" echo function W($id){if(-not (Has 'winget')){throw "winget nao encontrado para instalar $id"}; winget install -e --id $id --accept-package-agreements --accept-source-agreements --silent}
>>"%BOOT%" echo if(-not (Has 'git')){W 'Git.Git';$env:Path+=';C:\Program Files\Git\cmd'}
>>"%BOOT%" echo if(-not (Has 'node')){W 'OpenJS.NodeJS.LTS';$env:Path+=';C:\Program Files\nodejs'}
>>"%BOOT%" echo if(-not (Has 'python')){W 'Python.Python.3.12'}
>>"%BOOT%" echo $app='%APP%';$parent=Split-Path $app -Parent;New-Item -ItemType Directory -Force -Path $parent ^| Out-Null
>>"%BOOT%" echo if(Test-Path "$app\.git"){$dirty=git -C $app status --porcelain;if($dirty){git -C $app stash push -u -m "RB installer backup $(Get-Date -Format s)" ^| Out-Host};git -C $app pull --ff-only ^| Out-Host}else{git clone https://github.com/rennanbrasileiro/rb-workspace-intelligence.git $app ^| Out-Host}
>>"%BOOT%" echo Set-Location $app;npm run build ^| Out-Host;python -m pip install -r requirements.txt --user ^| Out-Host
>>"%BOOT%" echo $ws=New-Object -ComObject WScript.Shell;$desktop=[Environment]::GetFolderPath('Desktop');$menu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';foreach($t in @((Join-Path $desktop 'RB Workspace Intelligence.lnk'),(Join-Path $menu 'RB Workspace Intelligence.lnk'))){$s=$ws.CreateShortcut($t);$s.TargetPath=Join-Path $app 'START_RB_WORKSPACE.cmd';$s.WorkingDirectory=$app;$s.Description='RB Workspace Intelligence';$s.Save()};Start-Process (Join-Path $app 'START_RB_WORKSPACE.cmd')
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BOOT%"
set "ERR=%ERRORLEVEL%"
del "%BOOT%" >nul 2>nul
if not "%ERR%"=="0" (echo.&echo [ERRO] Instalacao nao concluida.&pause&exit /b %ERR%)
echo.
echo Instalacao concluida. Nas proximas versoes use Atualizar dentro da Dev Console.
pause
