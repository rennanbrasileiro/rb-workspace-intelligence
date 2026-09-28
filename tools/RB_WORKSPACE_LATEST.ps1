param()
$ErrorActionPreference = "Stop"
$Repo = "rennanbrasileiro/rb-workspace-intelligence"
$Runtime = Join-Path $env:USERPROFILE "RB\Runtime\rb-workspace-intelligence"
$StateDir = Join-Path $env:LOCALAPPDATA "RBWorkspace"
$Log = Join-Path $StateDir "launcher.log"
$Cache = Join-Path $StateDir "last-valid.json"
$ServerLog = Join-Path $StateDir "server.log"
$Port = 4310
$Url = "http://127.0.0.1:$Port/"
$SystemUrl = "http://127.0.0.1:$Port/api/system"
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
function Get-RunningSystem {
    try { return Invoke-RestMethod -Uri $SystemUrl -UseBasicParsing -TimeoutSec 2 } catch { return $null }
}
function Open-Workspace {
    Start-Process $Url
}
function Get-CachedBuild {
    if (-not (Test-Path -LiteralPath $Cache)) { return $null }
    try { return Get-Content -LiteralPath $Cache -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}
function Save-CachedBuild([string]$Sha,[string]$Version) {
    [PSCustomObject]@{sha=$Sha;version=$Version;validatedAt=(Get-Date).ToUniversalTime().ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $Cache -Encoding UTF8
}

try {
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " RB WORKSPACE INTELLIGENCE" -ForegroundColor Cyan
    Write-Host " Ultima versao validada pelo CI" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""

    foreach ($cmd in @("git","node","npm")) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fail "$cmd nao foi encontrado no Windows." }
    }

    $running = Get-RunningSystem
    $sha = $null
    $online = $false

    try {
        Log "Consultando a ultima versao aprovada..."
        $headers = @{"User-Agent"="RB-Workspace-Launcher";"Accept"="application/vnd.github+json"}
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
        if ($run) { $sha=[string]$run.head_sha; $online=$true }
    } catch {
        Log "GitHub indisponivel. Tentando a ultima versao validada localmente..."
    }

    if (-not $sha) {
        $cached = Get-CachedBuild
        if ($cached -and $cached.sha) {
            $sha = [string]$cached.sha
            Log "Modo offline: usando build validado em cache $($sha.Substring(0,8))."
        } elseif ($running -and $running.ok) {
            Log "Modo offline: o Workspace ja esta saudavel. Abrindo a instancia atual."
            Open-Workspace
            exit 0
        } else {
            Fail "Nao foi possivel consultar o GitHub e ainda nao existe uma versao validada localmente."
        }
    }

    $short = $sha.Substring(0,8)
    Log "Versao validada selecionada: $short"

    if ($running -and $running.ok -and $running.buildCommit -eq $sha) {
        Log "Essa versao ja esta rodando e saudavel. Abrindo sem reiniciar."
        Open-Workspace
        exit 0
    }

    if (-not (Test-Path -LiteralPath (Join-Path $Runtime ".git"))) {
        if (-not $online) { Fail "O runtime local ainda nao existe e a internet esta indisponivel." }
        Log "Criando copia exclusiva para execucao..."
        New-Item -ItemType Directory -Force -Path (Split-Path $Runtime -Parent) | Out-Null
        if (Test-Path -LiteralPath $Runtime) { Remove-Item -LiteralPath $Runtime -Recurse -Force }
        & git clone "https://github.com/$Repo.git" $Runtime
        if ($LASTEXITCODE -ne 0) { Fail "Falha ao criar a copia de execucao." }
    }

    Push-Location $Runtime
    try {
        if ($online) {
            Log "Atualizando copia de execucao..."
            & git fetch --prune origin main
            if ($LASTEXITCODE -ne 0) { Log "Fetch falhou; verificando se o build validado ja existe localmente." }
        }

        & git cat-file -e "$sha^{commit}" 2>$null
        if ($LASTEXITCODE -ne 0) {
            if (-not $online) { Fail "O build validado em cache nao existe mais no runtime local." }
            & git fetch origin $sha
            if ($LASTEXITCODE -ne 0) { Fail "O commit validado nao foi encontrado." }
        }

        & git reset --hard $sha
        if ($LASTEXITCODE -ne 0) { Fail "Falha ao ativar a versao validada." }
        & git clean -fd | Out-Null

        $pkg = Get-Content -LiteralPath (Join-Path $Runtime "package.json") -Raw | ConvertFrom-Json
        Log "Workspace $($pkg.version) | commit $short"

        Log "Validando build local..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { Fail "O build local falhou. A aplicacao nao sera iniciada." }
        Save-CachedBuild -Sha $sha -Version ([string]$pkg.version)

        $running = Get-RunningSystem
        if ($running -and $running.ok -and $running.buildCommit -eq $sha) {
            Log "Workspace ja esta pronto. Abrindo navegador."
            Open-Workspace
            exit 0
        }

        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($l in @($listeners)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($l.OwningProcess)" -ErrorAction SilentlyContinue
            if ($proc -and ($proc.Name -match "node" -or $proc.CommandLine -match "server\.mjs|rb-workspace-intelligence")) {
                Log "Atualizando a instancia anterior do Workspace..."
                Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
            } else {
                Fail "A porta $Port esta sendo usada por outro programa. Nao vou encerra-lo automaticamente."
            }
        }

        Log "Iniciando servidor..."
        $previousCommit = $env:RBWI_COMMIT_SHA
        $env:RBWI_COMMIT_SHA = $sha
        try {
            Start-Process -FilePath "cmd.exe" `
                -ArgumentList "/c", "node server.mjs >> `"$ServerLog`" 2>&1" `
                -WorkingDirectory $Runtime `
                -WindowStyle Minimized | Out-Null
        } finally {
            if ($null -eq $previousCommit) { Remove-Item Env:RBWI_COMMIT_SHA -ErrorAction SilentlyContinue }
            else { $env:RBWI_COMMIT_SHA = $previousCommit }
        }

        $system = $null
        for ($i=0; $i -lt 40; $i++) {
            Start-Sleep -Milliseconds 500
            $system = Get-RunningSystem
            if ($system -and $system.ok -and $system.buildCommit -eq $sha) { break }
        }
        if (-not $system -or -not $system.ok) { Fail "O servidor nao respondeu na porta $Port. Consulte $ServerLog" }
        if ($system.buildCommit -ne $sha) { Fail "O servidor respondeu, mas nao confirmou o commit validado $short." }

        Log "Workspace pronto. Abrindo navegador..."
        Open-Workspace
        Write-Host ""
        Write-Host "PRONTO: Workspace $($pkg.version) | $short" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } finally {
        Pop-Location
    }
} catch {
    Fail $_.Exception.Message
}
