param([switch]$Apply)
$ErrorActionPreference='Stop'
$HomeDir=$env:USERPROFILE
$StateFile=Join-Path $HomeDir '.rb-workspace-intelligence\state.json'
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir=Join-Path $HomeDir "Desktop\RB_RECOVERY_$Stamp"
$LogFile=Join-Path $BackupDir 'recovery-log.txt'
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
function Log([string]$m){$m|Tee-Object -FilePath $LogFile -Append|Write-Host}
try{Get-NetTCPConnection -LocalPort 4310 -State Listen -ErrorAction Stop|ForEach-Object{Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue}}catch{}
if(!(Test-Path $StateFile)){throw "state.json não encontrado: $StateFile"}
Copy-Item $StateFile (Join-Path $BackupDir 'state.json.backup') -Force
$state=Get-Content $StateFile -Raw|ConvertFrom-Json
$ops=@()
foreach($tx in @($state.transactions)){foreach($op in @($tx.operations)){if($op.status -eq 'completed' -and $op.before -and $op.after){$ops += [PSCustomObject]@{created=[string]$tx.createdAt;before=[string]$op.before;after=[string]$op.after;hash=[string]$op.afterHash}}}}
$ops=$ops|Sort-Object created -Descending
$restored=0;$missing=0;$occupied=0;$changed=0;$errors=0
foreach($op in $ops){if(!(Test-Path -LiteralPath $op.after)){$missing++;continue};if(Test-Path -LiteralPath $op.before){$occupied++;continue};if($op.hash){try{$h=(Get-FileHash -Algorithm SHA256 -LiteralPath $op.after).Hash.ToLower();if($h -ne $op.hash.ToLower()){$changed++;continue}}catch{}};Log "[RECUPERAR] $($op.after) -> $($op.before)";if($Apply){try{$parent=Split-Path -Parent $op.before;if($parent){New-Item -ItemType Directory -Force -Path $parent|Out-Null};Move-Item -LiteralPath $op.after -Destination $op.before;$restored++}catch{$errors++;Log "[ERRO] $($_.Exception.Message)"}}}
Log '===== RESUMO =====';Log "Restaurados: $restored";Log "Não encontrados no destino atual: $missing";Log "Original já ocupado: $occupied";Log "Alterados após organização: $changed";Log "Erros: $errors";if(!$Apply){Log 'SIMULAÇÃO: nenhum arquivo foi movido.'}
Write-Host "Log: $LogFile" -ForegroundColor Cyan
