# Build monitor + installer; publish to share\Joblio Cloud Monitor\
$ErrorActionPreference = "Stop"
$Tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$MonitorProj = Join-Path $Tools "..\JoblioStackMonitor\JoblioStackMonitor.csproj"
$SetupDir = $Tools
$MonitorPublish = Join-Path $Tools "_monitor_publish"
$PayloadZip = Join-Path $SetupDir "payload.zip"
$SetupPublish = Join-Path $SetupDir "publish"
$ShareRoot = "\\server\D\Joblio DB\Jobtracker"
$ShareRootLegacy = "\\server\Gary\Job Tracker"
$MonitorShareDir = Join-Path $ShareRoot "Joblio Cloud Monitor"
$SetupOut = Join-Path $MonitorShareDir "Install Joblio Cloud Monitor (once).exe"
$LauncherOut = Join-Path $MonitorShareDir "Open Joblio Cloud Monitor.cmd"
$ReadmeOut = Join-Path $MonitorShareDir "README.txt"

Write-Host "1) Build monitor..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $MonitorPublish -ErrorAction SilentlyContinue
dotnet publish $MonitorProj -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=false -p:DebugType=None -p:DebugSymbols=false `
  -o $MonitorPublish
if ($LASTEXITCODE -ne 0) { throw "monitor publish failed" }
Get-ChildItem $MonitorPublish -Filter "JoblioStackMonitor.*" -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item (Join-Path $Tools "..\JoblioStackMonitor\monitor-config.json") $MonitorPublish -Force

Write-Host "2) Zip payload..." -ForegroundColor Cyan
Remove-Item -Force $PayloadZip -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($MonitorPublish, $PayloadZip)

Write-Host "3) Build Setup.exe..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $SetupPublish -ErrorAction SilentlyContinue
dotnet publish (Join-Path $SetupDir "JoblioCloudMonitorSetup.csproj") -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false `
  -o $SetupPublish
if ($LASTEXITCODE -ne 0) { throw "setup publish failed" }

$builtSetup = Join-Path $SetupPublish "JoblioCloudMonitor-Setup.exe"
if (-not (Test-Path $builtSetup)) { throw "Setup exe missing" }

Write-Host "4) Prepare share folder..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $MonitorShareDir | Out-Null

foreach ($name in @(
  'JoblioStackMonitor',
  'JoblioCloudMonitor',
  'JoblioCloudMonitor-v1.2',
  '_JoblioCloudMonitor_staging',
  '_DELETE_ME_old_JoblioStackMonitor'
)) {
  $p = Join-Path $ShareRoot $name
  if (Test-Path -LiteralPath $p) {
    Write-Host "   removing old folder $name"
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Retire confusing root-level names from earlier versions
foreach ($oldFile in @(
  'JoblioCloudMonitor-Setup.exe',
  'JoblioCloudMonitor-Setup-README.txt',
  'Open Cloud Monitor.cmd'
)) {
  $p = Join-Path $ShareRoot $oldFile
  if (Test-Path -LiteralPath $p) {
    Write-Host "   removing old file $oldFile"
    Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "5) Copy to Joblio Cloud Monitor\" -ForegroundColor Cyan
Copy-Item $builtSetup $SetupOut -Force
$readmeSrc = Join-Path $Tools "..\JoblioStackMonitor\README.txt"
$launcherSrc = Join-Path $Tools "..\JoblioStackMonitor\Open Joblio Cloud Monitor.cmd"
$promptSrc = Join-Path $Tools "..\JoblioStackMonitor\SERVER-PROMPT_monitor-paths.txt"
if (Test-Path $readmeSrc) { Copy-Item $readmeSrc $ReadmeOut -Force }
if (Test-Path $launcherSrc) { Copy-Item $launcherSrc $LauncherOut -Force }
if (Test-Path $promptSrc) {
  Copy-Item $promptSrc (Join-Path $MonitorShareDir "SERVER-PROMPT_monitor-paths.txt") -Force
}

foreach ($root in @($ShareRootLegacy)) {
  foreach ($name in @('JoblioStackMonitor', 'JoblioCloudMonitor', 'JoblioCloudMonitor-v1.2')) {
    $p = Join-Path $root $name
    if (Test-Path -LiteralPath $p) {
      Write-Host "   legacy cleanup: $p" -ForegroundColor DarkYellow
      Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Remove-Item -Recurse -Force $MonitorPublish, $SetupPublish -ErrorAction SilentlyContinue
Remove-Item -Force $PayloadZip -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $SetupDir "bin"), (Join-Path $SetupDir "obj") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $Tools "..\JoblioStackMonitor\bin"), (Join-Path $Tools "..\JoblioStackMonitor\obj"), (Join-Path $Tools "..\JoblioStackMonitor\publish") -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "DONE:" -ForegroundColor Green
Write-Host "  $SetupOut"
Write-Host "  $LauncherOut"
Write-Host ""
Get-ChildItem -LiteralPath $MonitorShareDir | Format-Table Name, Length, LastWriteTime -AutoSize
