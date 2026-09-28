$ErrorActionPreference = "Stop"
$Source = Join-Path $env:USERPROFILE "Downloads\RB_WORKSPACE_LATEST.ps1"
$InstallDir = Join-Path $env:LOCALAPPDATA "RBWorkspace"
$Launcher = Join-Path $InstallDir "RB_WORKSPACE_LATEST.ps1"
$Desktop = [Environment]::GetFolderPath("Desktop")
$Shortcut = Join-Path $Desktop "RB Workspace Intelligence.lnk"

if (-not (Test-Path -LiteralPath $Source)) {
    Write-Host "Nao encontrei RB_WORKSPACE_LATEST.ps1 em Downloads." -ForegroundColor Red
    Read-Host "Pressione ENTER para fechar"
    exit 1
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -LiteralPath $Source -Destination $Launcher -Force

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($Shortcut)
$sc.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$sc.WorkingDirectory = $InstallDir
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$sc.Description = "RB Workspace Intelligence - ultima versao validada pelo CI"
$sc.Save()

Write-Host ""
Write-Host "ATALHO CRIADO COM SUCESSO:" -ForegroundColor Green
Write-Host $Shortcut -ForegroundColor Cyan
Write-Host ""
Write-Host "A partir de agora, use somente esse atalho." -ForegroundColor Yellow
Start-Sleep -Seconds 2
