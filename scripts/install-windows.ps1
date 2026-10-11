[CmdletBinding()]
param(
    [string]$Repository = 'Magiciakwf/embedded-workbench-custom',
    [string]$Ref = '0.9.3-custom.1',
    [string]$LocalMarketplaceRoot,
    [switch]$KeepDuplicateSkills,
    [switch]$SkipRuntimeSmoke
)

$ErrorActionPreference = 'Stop'
$PluginName = 'embedded-workbench-custom'
$MarketplaceName = 'embedded-workbench-custom'
$OfficialSelector = 'embedded-workbench@embedded-workbench-dev'
$DuplicateSkills = @(
    'embedded-code-review', 'stm32-driver-debug', 'freertos-debug', 'hardfault-analyzer',
    'datasheet-reader', 'firmware-memory-analyzer', 'embedded-bug-investigator', 'embedded-code-generator'
)

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Set-PluginEnabled([string]$ConfigPath, [string]$Selector, [bool]$Enabled) {
    if (-not (Test-Path -LiteralPath $ConfigPath)) { return }
    $text = [IO.File]::ReadAllText($ConfigPath)
    $header = [regex]::Escape("[plugins.`"$Selector`"]")
    $value = if ($Enabled) { 'true' } else { 'false' }
    $pattern = "(?ms)(^$header\s*.*?^enabled\s*=\s*)(true|false)"
    if ([regex]::IsMatch($text, $pattern)) {
        $text = [regex]::Replace($text, $pattern, "`$1$value", 1)
        [IO.File]::WriteAllText($ConfigPath, $text, [Text.UTF8Encoding]::new($false))
    }
}

Assert-Command git
Assert-Command codex

$userRoot = [Environment]::GetFolderPath('UserProfile')
$codexRoot = Join-Path $userRoot '.codex'
$configPath = Join-Path $codexRoot 'config.toml'
$skillsRoot = Join-Path $codexRoot 'skills'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $codexRoot "backups\embedded-workbench-custom\$stamp"
$disabledRoot = Join-Path $backupRoot 'user-skills-disabled'
New-Item -ItemType Directory -Force -Path $backupRoot, $disabledRoot | Out-Null
$priorBackups = Get-ChildItem -LiteralPath (Split-Path -Parent $backupRoot) -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $backupRoot } |
    Sort-Object LastWriteTimeUtc -Descending

if (Test-Path -LiteralPath $configPath) {
    Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupRoot 'config.toml')
}

# Preserve a configuration from before this custom plugin was first enabled. A
# later idempotent install must still offer one-step restoration to the original
# official-plugin + user-Skill arrangement, not merely to the previous custom
# install. Propagate an earlier original-config.toml when present; otherwise use
# the newest recorded config that has no custom plugin section.
$originalConfigName = 'original-config.toml'
$originalConfigPath = Join-Path $backupRoot $originalConfigName
$customSelectorPattern = '(?m)^\[plugins\."embedded-workbench-custom@embedded-workbench-custom"\]\s*$'
if (Test-Path -LiteralPath $configPath) {
    $currentConfig = [IO.File]::ReadAllText($configPath)
    if ($currentConfig -notmatch $customSelectorPattern) {
        Copy-Item -LiteralPath $configPath -Destination $originalConfigPath
    } else {
        foreach ($prior in $priorBackups) {
            $propagated = Join-Path $prior.FullName $originalConfigName
            if (Test-Path -LiteralPath $propagated) {
                Copy-Item -LiteralPath $propagated -Destination $originalConfigPath
                break
            }
            $candidate = Join-Path $prior.FullName 'config.toml'
            if (Test-Path -LiteralPath $candidate) {
                $candidateText = [IO.File]::ReadAllText($candidate)
                if ($candidateText -notmatch $customSelectorPattern) {
                    Copy-Item -LiteralPath $candidate -Destination $originalConfigPath
                    break
                }
            }
        }
        if (-not (Test-Path -LiteralPath $originalConfigPath)) {
            Write-Warning 'No pre-custom configuration backup was found; restore will return to the immediately preceding configuration.'
            Copy-Item -LiteralPath $configPath -Destination $originalConfigPath
        }
    }
}

# If a prior idempotent install already moved a duplicate user Skill out of the
# discovery path, carry that recoverable copy forward into the new backup. This
# keeps the newest backup independently restorable.
foreach ($skill in $DuplicateSkills) {
    $activeSkill = Join-Path $skillsRoot $skill
    $savedSkill = Join-Path $disabledRoot $skill
    if ((Test-Path -LiteralPath $activeSkill) -or (Test-Path -LiteralPath $savedSkill)) { continue }
    foreach ($prior in $priorBackups) {
        $candidate = Join-Path (Join-Path $prior.FullName 'user-skills-disabled') $skill
        if (Test-Path -LiteralPath $candidate) {
            Copy-Item -LiteralPath $candidate -Destination $savedSkill -Recurse
            break
        }
    }
}

$inventory = @()
foreach ($skill in $DuplicateSkills) {
    $source = Join-Path $skillsRoot $skill
    if (-not (Test-Path -LiteralPath $source)) {
        $source = Join-Path $disabledRoot $skill
    }
    if (-not (Test-Path -LiteralPath $source)) { continue }
    Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object {
        $inventory += [pscustomobject]@{
            skill = $skill
            relativePath = [IO.Path]::GetRelativePath($source, $_.FullName)
            length = $_.Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
        }
    }
}
$inventory | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupRoot 'user-skill-inventory.json') -Encoding utf8NoBOM

$marketplaces = (& codex plugin marketplace list 2>&1 | Out-String)
if ($marketplaces -notmatch "(?m)^$([regex]::Escape($MarketplaceName))\s+") {
    if ($LocalMarketplaceRoot) {
        $resolved = (Resolve-Path -LiteralPath $LocalMarketplaceRoot).Path
        & codex plugin marketplace add $resolved --json
    } else {
        & codex plugin marketplace add $Repository --ref $Ref --json
    }
    if ($LASTEXITCODE -ne 0) { throw 'Failed to add the custom marketplace.' }
} elseif (-not $LocalMarketplaceRoot) {
    & codex plugin marketplace upgrade $MarketplaceName
    if ($LASTEXITCODE -ne 0) { throw 'Failed to refresh the custom marketplace.' }
}

& codex plugin add "$PluginName@$MarketplaceName" --json
if ($LASTEXITCODE -ne 0) { throw 'Failed to install the custom plugin.' }

$pluginList = (& codex plugin list 2>&1 | Out-String)
if ($pluginList -notmatch "(?m)^$([regex]::Escape($PluginName))@$([regex]::Escape($MarketplaceName))\s+installed, enabled") {
    throw 'Codex did not report the custom plugin as installed and enabled.'
}

if (-not $KeepDuplicateSkills) {
    foreach ($skill in $DuplicateSkills) {
        $source = Join-Path $skillsRoot $skill
        if (-not (Test-Path -LiteralPath $source)) { continue }
        Move-Item -LiteralPath $source -Destination (Join-Path $disabledRoot $skill)
    }
    Set-PluginEnabled -ConfigPath $configPath -Selector $OfficialSelector -Enabled $false
}

$state = [ordered]@{
    createdAt = (Get-Date).ToString('o')
    plugin = $PluginName
    marketplace = $MarketplaceName
    repository = $Repository
    ref = $Ref
    localMarketplaceRoot = $LocalMarketplaceRoot
    configBackup = if (Test-Path -LiteralPath (Join-Path $backupRoot 'config.toml')) { 'config.toml' } else { $null }
    originalConfigBackup = if (Test-Path -LiteralPath $originalConfigPath) { $originalConfigName } else { $null }
    disabledSkills = @($DuplicateSkills | Where-Object { Test-Path -LiteralPath (Join-Path $disabledRoot $_) })
}
$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupRoot 'state.json') -Encoding utf8NoBOM

$verify = Join-Path $PSScriptRoot 'verify-install.ps1'
$verifyParams = @{ BackupPath = $backupRoot }
if (-not $KeepDuplicateSkills) { $verifyParams.RequireIsolated = $true }
if (-not $SkipRuntimeSmoke) { $verifyParams.RuntimeSmoke = $true }
& $verify @verifyParams
if ($LASTEXITCODE -ne 0) { throw "Verification failed. Restore with: & '$PSScriptRoot\restore-previous.ps1' -BackupPath '$backupRoot'" }

Write-Host "Installation verified. Backup: $backupRoot" -ForegroundColor Green
Write-Host "Restore command: & '$PSScriptRoot\restore-previous.ps1' -BackupPath '$backupRoot'"
Write-Host 'Start a new Codex chat (or restart the desktop app) before daily use.'
