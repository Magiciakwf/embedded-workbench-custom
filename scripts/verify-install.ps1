[CmdletBinding()]
param(
    [string]$BackupPath,
    [switch]$RequireIsolated,
    [switch]$RuntimeSmoke
)

$ErrorActionPreference = 'Stop'
$PluginName = 'embedded-workbench-custom'
$MarketplaceName = 'embedded-workbench-custom'
$ExpectedSkills = @(
    'embedded-workbench', 'embedded-firmware-dev', 'c-cpp-dev', 'state-machine-design',
    'hardfault-triage', 'debug-methodology', 'keil-mdk-build', 'fact-check',
    'embedded-code-review', 'stm32-driver-debug', 'freertos-debug', 'hardfault-analyzer',
    'datasheet-reader', 'firmware-memory-analyzer', 'embedded-bug-investigator', 'embedded-code-generator'
)
$DuplicateUserSkills = $ExpectedSkills[8..15]

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { throw 'codex was not found in PATH.' }
$userRoot = [Environment]::GetFolderPath('UserProfile')
$codexRoot = Join-Path $userRoot '.codex'
$configPath = Join-Path $codexRoot 'config.toml'

$list = (& codex plugin list 2>&1 | Out-String)
if ($list -notmatch "(?m)^$PluginName@$MarketplaceName\s+installed, enabled") {
    throw "$PluginName@$MarketplaceName is not installed and enabled."
}

$manifests = Get-ChildItem -LiteralPath (Join-Path $codexRoot 'plugins\cache') -Filter plugin.json -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '[\\/]\.codex-plugin[\\/]plugin\.json$' } |
    ForEach-Object {
        try { [pscustomobject]@{ file = $_; manifest = (Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json) } } catch { $null }
    } | Where-Object { $_ -and $_.manifest.name -eq $PluginName }
if (-not $manifests) { throw 'No installed custom plugin manifest was found in the Codex cache.' }
$installed = $manifests | Sort-Object { $_.file.LastWriteTimeUtc } -Descending | Select-Object -First 1
$pluginRoot = Split-Path -Parent (Split-Path -Parent $installed.file.FullName)

$actualSkills = Get-ChildItem -LiteralPath (Join-Path $pluginRoot 'skills') -Directory | Select-Object -ExpandProperty Name | Sort-Object
$missing = $ExpectedSkills | Where-Object { $_ -notin $actualSkills }
$extra = $actualSkills | Where-Object { $_ -notin $ExpectedSkills }
if ($missing -or $extra) { throw "Skill roster mismatch. Missing: $($missing -join ', '); extra: $($extra -join ', ')" }
foreach ($skill in $ExpectedSkills) {
    $entry = Join-Path $pluginRoot "skills\$skill\SKILL.md"
    if (-not (Test-Path -LiteralPath $entry)) { throw "Missing installed skill entry: $entry" }
}

if ($RequireIsolated) {
    $config = if (Test-Path -LiteralPath $configPath) { Get-Content -Raw -LiteralPath $configPath } else { '' }
    $official = [regex]::Match($config, '(?ms)^\[plugins\."embedded-workbench@embedded-workbench-dev"\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
    if ($official.Success -and $official.Groups['body'].Value -match '(?m)^enabled\s*=\s*true') {
        throw 'The official embedded-workbench plugin is still enabled.'
    }
    foreach ($skill in $DuplicateUserSkills) {
        if (Test-Path -LiteralPath (Join-Path $codexRoot "skills\$skill")) {
            throw "Duplicate user skill is still discoverable: $skill"
        }
    }
}

if ($RuntimeSmoke) {
    $evidenceRoot = if ($BackupPath) { Join-Path $BackupPath 'runtime-evidence' } else { Join-Path $codexRoot 'tmp\embedded-workbench-custom-evidence' }
    New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
    $evidence = Join-Path $evidenceRoot 'freertos-debug-manual.jsonl'
    $prompt = 'Manually load $embedded-workbench-custom:freertos-debug. Reply with the absolute SKILL.md path you actually read. Do not modify files.'
    & codex exec --ephemeral --json --sandbox read-only --ignore-rules --skip-git-repo-check $prompt 2>&1 | Tee-Object -FilePath $evidence | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Codex runtime smoke test failed.' }
    $runtime = Get-Content -Raw -LiteralPath $evidence
    # JSONL command events escape Windows separators. Normalize those escapes
    # before comparing against the real cache path.
    $runtime = $runtime.Replace('\\', '\')
    $escapedRoot = [regex]::Escape($pluginRoot)
    if ($runtime -notmatch $escapedRoot -or $runtime -notmatch 'freertos-debug[\\/]SKILL\.md') {
        throw "Runtime smoke did not prove a read from the custom plugin cache. Evidence: $evidence"
    }
}

Write-Host "PASS: $PluginName is installed from $pluginRoot" -ForegroundColor Green
Write-Host "PASS: all $($ExpectedSkills.Count) Skill entrypoints exist"
if ($RequireIsolated) { Write-Host 'PASS: official plugin disabled and duplicate user Skills isolated' }
if ($RuntimeSmoke) { Write-Host 'PASS: real Codex runtime read freertos-debug from the custom cache' }
