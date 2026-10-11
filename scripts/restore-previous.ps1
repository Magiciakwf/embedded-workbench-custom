[CmdletBinding()]
param([string]$BackupPath)

$ErrorActionPreference = 'Stop'
$userRoot = [Environment]::GetFolderPath('UserProfile')
$codexRoot = Join-Path $userRoot '.codex'
$backupBase = Join-Path $codexRoot 'backups\embedded-workbench-custom'

if (-not $BackupPath) {
    $latest = Get-ChildItem -LiteralPath $backupBase -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $latest) { throw "No backup was found under $backupBase" }
    $BackupPath = $latest.FullName
}
$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$statePath = Join-Path $BackupPath 'state.json'
if (-not (Test-Path -LiteralPath $statePath)) { throw "Missing backup state: $statePath" }
$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json

$configBackupName = if ($state.PSObject.Properties.Name -contains 'originalConfigBackup' -and $state.originalConfigBackup) {
    [string]$state.originalConfigBackup
} else {
    'config.toml'
}
$configBackup = Join-Path $BackupPath $configBackupName
if (Test-Path -LiteralPath $configBackup) {
    Copy-Item -LiteralPath $configBackup -Destination (Join-Path $codexRoot 'config.toml') -Force
}

$disabledRoot = Join-Path $BackupPath 'user-skills-disabled'
$skillsRoot = Join-Path $codexRoot 'skills'
foreach ($skill in @($state.disabledSkills)) {
    $source = Join-Path $disabledRoot $skill
    $target = Join-Path $skillsRoot $skill
    if (-not (Test-Path -LiteralPath $source)) { continue }
    if (Test-Path -LiteralPath $target) { throw "Refusing to overwrite existing restored Skill: $target" }
    Move-Item -LiteralPath $source -Destination $target
}

$inventoryPath = Join-Path $BackupPath 'user-skill-inventory.json'
if (Test-Path -LiteralPath $inventoryPath) {
    $inventory = @(Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json)
    foreach ($row in $inventory) {
        $file = Join-Path (Join-Path $skillsRoot $row.skill) $row.relativePath
        if (-not (Test-Path -LiteralPath $file)) { throw "Restored file missing: $file" }
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash
        if ($hash -ne $row.sha256) { throw "Restored hash mismatch: $file" }
    }
}

Write-Host "Previous Codex configuration and user Skills restored from $BackupPath" -ForegroundColor Green
Write-Host 'The custom cache was retained for recoverability but is no longer enabled by the restored configuration.'
Write-Host 'Restart Codex or start a new chat to load the restored environment.'
