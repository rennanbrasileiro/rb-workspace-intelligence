$ErrorActionPreference = "Stop"

$InstallDir = Join-Path $env:LOCALAPPDATA "RBWorkspace"
$Launcher = Join-Path $InstallDir "RB_WORKSPACE_LATEST.ps1"
$Desktop = [Environment]::GetFolderPath("Desktop")
$Shortcut = Join-Path $Desktop "RB Workspace Intelligence.lnk"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$launcherContent = @'
param()
$ErrorActionPreference = "Stop"
$Repo = "rennanbrasileiro/rb-workspace-intelligence"
$Runtime = Join-Path $env:USERPROFILE "RB\Runtime\rb-workspace-intelligence"
$StateDir = Join-Path $env:LOCALAPPDATA "RBWorkspace"
$Log = Join-Path $StateDir "launcher.log"
$Port = 4310
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    Add-Content -LiteralPath $Log -Value $line -Encoding UTF8
    Write-Host $Message
}
function Fail([string]$Message) {
    Log "ERRO: $Message"
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Log: $Log" -ForegroundColor Yellow
    Read-Host "Pressione ENTER para fechar"
    exit 1
}

try {
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " RB WORKSPACE INTELLIGENCE" -ForegroundColor Cyan
    Write-Host " Ultima versao validada pelo CI" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""

    foreach ($cmd in @("git","node","npm")) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Fail "$cmd nao foi encontrado no Windows."
        }
    }

    Log "Consultando a ultima versao aprovada..."
    $headers = @{"User-Agent"="RB-Workspace-Launcher";"Accept"="application/vnd.github+json"}
    $api = "https://api.github.com/repos/$Repo/actions/runs?branch=main&status=success&per_page=20"
    $runs = Invoke-RestMethod -Uri $api -Headers $headers -UseBasicParsing

    $run = @($runs.workflow_runs) |
        Where-Object {
            $_.conclusion -eq "success" -and
            $_.status -eq "completed" -and
            $_.head_branch -eq "main" -and
            $_.path -eq ".github/workflows/verify.yml"
        } |
        Sort-Object {[datetime]$_.updated_at} -Descending |
        Select-Object -First 1

    if (-not $run) { Fail "Nao encontrei um build validado no GitHub." }

    $sha = [string]$run.head_sha
    $short = $sha.Substring(0,8)
    Log "Versao validada encontrada: $short"

    if (-not (Test-Path -LiteralPath (Join-Path $Runtime ".git"))) {
        Log "Criando copia exclusiva para execucao..."
        New-Item -ItemType Directory -Force -Path (Split-Path $Runtime -Parent) | Out-Null
        if (Test-Path -LiteralPath $Runtime) { Remove-Item -LiteralPath $Runtime -Recurse -Force }
        & git clone "https://github.com/$Repo.git" $Runtime
        if ($LASTEXITCODE -ne 0) { Fail "Falha ao criar a copia de execucao." }
    }

    Push-Location $Runtime
    try {
        Log "Atualizando copia de execucao..."
        & git fetch --prune origin main
        if ($LASTEXITCODE -ne 0) { Fail "Falha ao consultar o repositorio." }

        & git cat-file -e "$sha^{commit}" 2>$null
        if ($LASTEXITCODE -ne 0) {
            & git fetch origin $sha
            if ($LASTEXITCODE -ne 0) { Fail "O commit validado nao foi encontrado." }
        }

        & git reset --hard $sha
        if ($LASTEXITCODE -ne 0) { Fail "Falha ao ativar a versao validada." }
        & git clean -fd | Out-Null

        $pkg = Get-Content -LiteralPath (Join-Path $Runtime "package.json") -Raw | ConvertFrom-Json
        Log "Workspace $($pkg.version) | commit $short"

        Log "Validando build..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { Fail "O build falhou. A aplicacao nao sera iniciada." }

        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($l in @($listeners)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($l.OwningProcess)" -ErrorAction SilentlyContinue
            if ($proc -and ($proc.Name -match "node" -or $proc.CommandLine -match "server\.mjs|rb-workspace-intelligence")) {
                Log "Encerrando instancia anterior..."
                Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
            } else {
                Fail "A porta $Port esta sendo usada por outro programa. Nao vou encerra-lo automaticamente."
            }
        }

        $serverLog = Join-Path $StateDir "server.log"
        Log "Iniciando servidor..."
        Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "node server.mjs >> `"$serverLog`" 2>&1" `
            -WorkingDirectory $Runtime `
            -WindowStyle Minimized | Out-Null

        $ok = $false
        for ($i=0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 500
            try {
                $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/system" -UseBasicParsing -TimeoutSec 2
                if ($r.StatusCode -eq 200) { $ok = $true; break }
            } catch {}
        }
        if (-not $ok) { Fail "O servidor nao respondeu na porta $Port. Consulte $serverLog" }

        Log "Workspace pronto. Abrindo navegador..."
        Start-Process "http://127.0.0.1:$Port/"
        Write-Host ""
        Write-Host "PRONTO: Workspace $($pkg.version) | $short" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } finally {
        Pop-Location
    }
} catch {
    Fail $_.Exception.Message
}
'@

Set-Content -LiteralPath $Launcher -Value $launcherContent -Encoding UTF8

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
Write-Host "Atalho criado:" -ForegroundColor Cyan
Write-Host $Shortcut
Write-Host ""
Write-Host "A partir de agora, use somente o icone 'RB Workspace Intelligence' na Area de Trabalho." -ForegroundColor Yellow
Write-Host "Ele sempre busca a ultima versao aprovada pelo CI." -ForegroundColor Yellow
Write-Host ""
Read-Host "Pressione ENTER para fechar"
