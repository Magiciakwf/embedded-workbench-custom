# Windows installation, update and recovery

This repository packages Embedded Workbench Custom as a Codex plugin with 16 Skills and four Codex agent definitions. It preserves the upstream MIT license and attribution.

## Prerequisites

1. Install the current ChatGPT desktop app/Codex CLI for Windows and sign in.
2. Install Git and make sure `git` and `codex` are available in PowerShell.
3. For a private GitHub repository, authenticate Git before installation. The scripts do not store credentials or tokens.

## Stable installation

Open PowerShell and run:

```powershell
git clone --branch 0.9.3-custom.1 https://github.com/Magiciakwf/embedded-workbench-custom.git
Set-Location embedded-workbench-custom
& .\scripts\install-windows.ps1
```

The installer:

- records a timestamped backup under `$env:USERPROFILE\.codex\backups\embedded-workbench-custom`;
- registers the GitHub marketplace and installs `embedded-workbench-custom`;
- verifies that Codex reports the plugin installed and enabled;
- moves only the eight known duplicate user Skills out of the discovery path after hashing them;
- disables, but does not delete, `embedded-workbench@embedded-workbench-dev`;
- performs a real ephemeral Codex smoke test and requires the Skill read path to come from the custom plugin cache.

Start a new Codex chat after installation. Restart the desktop app if an already-open window retains the old plugin catalog.

## Verify

```powershell
& .\scripts\verify-install.ps1 -RequireIsolated -RuntimeSmoke
```

This validates the installed plugin record, all 16 installed `SKILL.md` entrypoints, duplicate isolation and a real `$embedded-workbench-custom:freertos-debug` read. It does not claim that every hardware-dependent workflow was exercised on target hardware.

## Update

Fetch the desired stable tag, inspect its release notes, and run the installer with that ref:

```powershell
git fetch --tags origin
git switch --detach <stable-tag>
& .\scripts\install-windows.ps1 -Ref <stable-tag>
```

The installer is repeatable. Each run creates a new backup before changing configuration or moving any duplicate user Skill.

## Roll back the plugin version

Run the installer from the known-good tag and pass the same tag as `-Ref`. If the marketplace was already registered on another Git ref, remove only the custom marketplace through the supported CLI, then rerun the installer:

```powershell
codex plugin marketplace remove embedded-workbench-custom
& .\scripts\install-windows.ps1 -Ref 0.9.3-custom.1
```

This does not touch the official marketplace or its cache.

## Restore the previous environment

To return to the backed-up official-plugin plus user-Skill setup:

```powershell
& .\scripts\restore-previous.ps1
```

To select a particular backup:

```powershell
& .\scripts\restore-previous.ps1 -BackupPath '<backup-directory>'
```

The restore script reinstates the pre-custom `config.toml`, moves the eight user Skills back, and verifies their SHA-256 hashes. Repeated installs propagate that original configuration into each new backup, so restoring the latest backup still returns to the official-plugin + user-Skill arrangement. It refuses to overwrite an existing Skill directory. The custom plugin cache is retained so recovery does not destroy data; the restored configuration no longer enables it.

## Local development test

From a clean development branch, install from the current checkout without publishing it:

```powershell
& .\scripts\install-windows.ps1 -LocalMarketplaceRoot $PWD
```

Use this only for development. Stable daily installations should use an immutable tag.

## Client notes

- Codex CLI 0.160.1 uses `codex plugin add`, not the older `codex plugin install` spelling.
- The desktop Plugins Directory can also install the plugin after the marketplace is registered. Select the **Embedded Workbench Custom** source, open the plugin, and choose **Install**.
- Current Windows installation and rollback are tested by this project. No claim is made that a second physical computer was tested.
