$ErrorActionPreference = "Stop"
$Repo = "rennanbrasileiro/rb-workspace-intelligence"
$InstallDir = Join-Path $env:LOCALAPPDATA "RBWorkspace"
$Launcher = Join-Path $InstallDir "RB_WORKSPACE_LATEST.ps1"
$Desktop = [Environment]::GetFolderPath("Desktop")
$Shortcut = Join-Path $Desktop "RB Workspace Intelligence.lnk"

function Fail([string]$Message) {
    Write-Host ""; Write-Host $Message -ForegroundColor Red; Write-Host ""
    Read-Host "Pressione ENTER para fechar"
    exit 1
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$downloaded = $false

try {
    Write-Host "Buscando o instalador da ultima versao aprovada pelo CI..." -ForegroundColor Cyan
    $headers = @{"User-Agent"="RB-Workspace-Installer";"Accept"="application/vnd.github+json"}
    $api = "https://api.github.com/repos/$Repo/actions/runs?branch=main&status=success&per_page=20"
    $runs = Invoke-RestMethod -Uri $api -Headers $headers -UseBasicParsing -TimeoutSec 10
    $run = @($runs.workflow_runs) |
        Where-Object {
            $_.conclusion -eq "success" -and
            $_.status -eq "completed" -and
            $_.head_branch -eq "main" -and
            $_.path -eq ".github/workflows/verify.yml"
        } |
        Sort-Object {[datetime]$_.updated_at} -Descending |
        Select-Object -First 1
    if (-not $run) { throw "Nenhuma build validada foi encontrada." }

    $sha = [string]$run.head_sha
    $raw = "https://raw.githubusercontent.com/$Repo/$sha/tools/RB_WORKSPACE_LATEST.ps1"
    $tmp = "$Launcher.download"
    Invoke-WebRequest -Uri $raw -OutFile $tmp -UseBasicParsing -TimeoutSec 20
    $text = Get-Content -LiteralPath $tmp -Raw -Encoding UTF8
    if ($text -notmatch 'rb-workspace-intelligence' -or $text -notmatch 'actions/runs') {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        throw "O launcher baixado nao passou na validacao basica."
    }
    Move-Item -LiteralPath $tmp -Destination $Launcher -Force
    $downloaded = $true
    Write-Host "Launcher validado instalado: $($sha.Substring(0,8))" -ForegroundColor Green
} catch {
    if (Test-Path -LiteralPath $Launcher) {
        Write-Host "Sem acesso ao GitHub. Mantendo o launcher ja instalado." -ForegroundColor Yellow
    } else {
        Fail "Nao foi possivel baixar o launcher e nao existe uma copia local anterior. $($_.Exception.Message)"
    }
}

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($Shortcut)
$sc.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$sc.WorkingDirectory = $InstallDir
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$sc.Description = "RB Workspace Intelligence - ultima versao validada pelo CI"
$sc.Save()

Write-Host ""
Write-Host "INSTALACAO CONCLUIDA." -ForegroundColor Green
Write-Host "Atalho: $Shortcut" -ForegroundColor Cyan
if ($downloaded) { Write-Host "O launcher oficial foi atualizado." -ForegroundColor Green }
Write-Host "A partir de agora, use somente esse icone na Area de Trabalho." -ForegroundColor Yellow
Write-Host ""
Read-Host "Pressione ENTER para fechar"
