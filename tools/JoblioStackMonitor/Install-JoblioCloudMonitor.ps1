#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# Prefer staging if present (used when old share folder was locked)
$candidates = @(
  (Split-Path -Parent $MyInvocation.MyCommand.Path),
  "D:\Joblio DB\Jobtracker\_JoblioCloudMonitor_staging",
  "D:\Joblio DB\Jobtracker\JoblioCloudMonitor",
  "\\server\D\Joblio DB\Jobtracker\_JoblioCloudMonitor_staging",
  "\\server\D\Joblio DB\Jobtracker\JoblioCloudMonitor",
  "D:\Gary\Job Tracker\_JoblioCloudMonitor_staging",
  "D:\Gary\Job Tracker\JoblioCloudMonitor",
  "\\server\Gary\Job Tracker\_JoblioCloudMonitor_staging",
  "\\server\Gary\Job Tracker\JoblioCloudMonitor"
)
$Source = $candidates | Where-Object { Test-Path (Join-Path $_ "JoblioCloudMonitor.exe") } | Select-Object -First 1
if (-not $Source) { throw "JoblioCloudMonitor.exe not found on share/staging" }

$Dest = "C:\Joblio-selfhost\monitor"
Write-Host "Source: $Source" -ForegroundColor Cyan
Write-Host "Installing Joblio Cloud Monitor v1.4 -> $Dest" -ForegroundColor Cyan

# Stop ALL old/new monitors so files unlock
Get-Process JoblioStackMonitor,JoblioCloudMonitor -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Wipe install dir
if (Test-Path $Dest) { Remove-Item -LiteralPath $Dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Dest "logs") | Out-Null

try { Add-MpPreference -ExclusionPath $Dest -ErrorAction Stop } catch { Write-Host $_.Exception.Message -ForegroundColor Yellow }

# Copy current build only (no old JoblioStackMonitor.*)
Get-ChildItem $Source -Force | Where-Object {
  $_.Name -notmatch '^Install-' -and
  $_.Name -notmatch '^Delete-' -and
  $_.Name -notmatch '^SERVER-' -and
  $_.Name -notmatch '^JoblioStackMonitor'
} | ForEach-Object {
  Copy-Item $_.FullName -Destination $Dest -Recurse -Force
}

$exe = Join-Path $Dest "JoblioCloudMonitor.exe"
if (-not (Test-Path $exe)) { throw "Install failed — JoblioCloudMonitor.exe missing" }

# Clean obsolete folders on this machine / share
foreach ($p in @(
  "D:\Gary\Job Tracker\JoblioStackMonitor",
  "D:\Gary\Job Tracker\JoblioCloudMonitor-v1.2",
  "C:\Joblio-selfhost\monitor\JoblioStackMonitor.exe",
  "C:\Joblio-selfhost\monitor\JoblioStackMonitor.dll"
)) {
  if (Test-Path -LiteralPath $p) {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed $p" -ForegroundColor Green
  }
}

# If share still has old exe names, delete them now that we killed the process
foreach ($shareRoot in @("D:\Gary\Job Tracker\JoblioCloudMonitor", "\\server\Gary\Job Tracker\JoblioCloudMonitor")) {
  if (-not (Test-Path $shareRoot)) { continue }
  Get-ChildItem -LiteralPath $shareRoot -Filter "JoblioStackMonitor.*" -Force -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# Promote staging -> final if needed
$staging = "D:\Gary\Job Tracker\_JoblioCloudMonitor_staging"
$final = "D:\Gary\Job Tracker\JoblioCloudMonitor"
if ((Test-Path $staging) -and (Test-Path (Join-Path $staging "JoblioCloudMonitor.exe"))) {
  if (Test-Path $final) {
    Remove-Item -LiteralPath $final -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path $final)) {
    Rename-Item -LiteralPath $staging -NewName "JoblioCloudMonitor" -Force -ErrorAction SilentlyContinue
    Write-Host "Promoted staging to JoblioCloudMonitor" -ForegroundColor Green
  }
}

# Startup shortcut (only one)
$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
Get-ChildItem $startup -Filter "*Joblio*Monitor*" -ErrorAction SilentlyContinue | Remove-Item -Force
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $startup "Joblio Cloud Monitor.lnk"))
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $Dest
$lnk.Description = "Joblio Cloud Monitor v1.4"
$lnk.Save()

Write-Host ""
Write-Host "Done. Title must be: Joblio Cloud Monitor v1.4" -ForegroundColor Green
Start-Process -FilePath $exe -WorkingDirectory $Dest
pause
