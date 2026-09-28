$ErrorActionPreference = 'Stop'
$Repo = 'rennanbrasileiro/rb-workspace-intelligence'

function Has([string]$Command){ return [bool](Get-Command $Command -ErrorAction SilentlyContinue) }
function Install-Winget([string]$Id){
    if(-not (Has 'winget')){ throw "winget nao encontrado para instalar $Id automaticamente." }
    winget install -e --id $Id --accept-package-agreements --accept-source-agreements --silent
    if($LASTEXITCODE -ne 0){ throw "Falha ao instalar $Id." }
}

Write-Host 'RB Workspace Intelligence - instalacao oficial' -ForegroundColor Cyan
Write-Host 'Validando dependencias...' -ForegroundColor Cyan
if(-not (Has 'git')){ Install-Winget 'Git.Git'; $env:Path += ';C:\Program Files\Git\cmd' }
if(-not (Has 'node')){ Install-Winget 'OpenJS.NodeJS.LTS'; $env:Path += ';C:\Program Files\nodejs' }
if(-not (Has 'npm')){ $env:Path += ';C:\Program Files\nodejs' }
if(-not (Has 'python')){ Install-Winget 'Python.Python.3.12' }

Write-Host 'Localizando a ultima release aprovada pelo CI...' -ForegroundColor Cyan
$headers=@{'User-Agent'='RB-Workspace-Bootstrap';'Accept'='application/vnd.github+json'}
$api="https://api.github.com/repos/$Repo/actions/runs?branch=main&status=success&per_page=20"
$runs=Invoke-RestMethod -Uri $api -Headers $headers -UseBasicParsing -TimeoutSec 15
$run=@($runs.workflow_runs) |
    Where-Object { $_.conclusion -eq 'success' -and $_.status -eq 'completed' -and $_.head_branch -eq 'main' -and $_.path -eq '.github/workflows/verify.yml' } |
    Sort-Object {[datetime]$_.updated_at} -Descending |
    Select-Object -First 1
if(-not $run){ throw 'Nenhuma release aprovada pelo CI foi encontrada.' }

$sha=[string]$run.head_sha
$tmp=Join-Path $env:TEMP "rbwi-installer-$($sha.Substring(0,8)).ps1"
$raw="https://raw.githubusercontent.com/$Repo/$sha/tools/INSTALAR_RB_WORKSPACE_ULTIMA_VERSAO.ps1"
Invoke-WebRequest -Uri $raw -OutFile $tmp -UseBasicParsing -TimeoutSec 20
try{
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tmp
    if($LASTEXITCODE -ne 0){ throw 'O instalador oficial retornou erro.' }
} finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
