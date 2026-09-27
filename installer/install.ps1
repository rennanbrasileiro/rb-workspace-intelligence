param([string]$InstallDir = "$env:USERPROFILE\RB\Projects\rb-workspace-intelligence")
$ErrorActionPreference = 'Stop'
function Say($m){ Write-Host "[RB] $m" -ForegroundColor Cyan }
function Has($cmd){ return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function WingetInstall($id){
  if(-not (Has 'winget')){ throw "winget não encontrado. Instale manualmente o pré-requisito: $id" }
  Say "Instalando $id..."
  winget install -e --id $id --accept-package-agreements --accept-source-agreements --silent
}
Say 'Preparando RB Workspace Intelligence 1.0'
if(-not (Has 'git')){ WingetInstall 'Git.Git'; $env:Path += ';C:\Program Files\Git\cmd' }
if(-not (Has 'node')){ WingetInstall 'OpenJS.NodeJS.LTS'; $env:Path += ';C:\Program Files\nodejs' }
if(-not (Has 'python')){ WingetInstall 'Python.Python.3.12' }
$parent = Split-Path $InstallDir -Parent
New-Item -ItemType Directory -Force -Path $parent | Out-Null
if(Test-Path "$InstallDir\.git"){
  Say 'Repositório já existe. Preservando alterações locais, se houver.'
  $dirty = git -C $InstallDir status --porcelain
  if($dirty){ git -C $InstallDir stash push -u -m "RB installer backup $(Get-Date -Format s)" | Out-Host }
  git -C $InstallDir pull --ff-only | Out-Host
}else{
  Say 'Clonando aplicação...'
  git clone https://github.com/rennanbrasileiro/rb-workspace-intelligence.git $InstallDir | Out-Host
}
Set-Location $InstallDir
Say 'Validando aplicação...'
npm run build | Out-Host
Say 'Instalando leitores de PDF/Office...'
python -m pip install -r requirements.txt --user | Out-Host
$desktop=[Environment]::GetFolderPath('Desktop')
$startMenu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$ws=New-Object -ComObject WScript.Shell
foreach($target in @((Join-Path $desktop 'RB Workspace Intelligence.lnk'),(Join-Path $startMenu 'RB Workspace Intelligence.lnk'))){
  $sc=$ws.CreateShortcut($target);$sc.TargetPath=Join-Path $InstallDir 'START_RB_WORKSPACE.cmd';$sc.WorkingDirectory=$InstallDir;$sc.Description='RB Workspace Intelligence';$sc.Save()
}
Say 'Instalação concluída. Abrindo Workspace Intelligence...'
Start-Process (Join-Path $InstallDir 'START_RB_WORKSPACE.cmd')
