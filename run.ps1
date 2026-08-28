# Joblio - Development Mode Launcher
# Right-click this file and select "Run with PowerShell" to start the app.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "========================================"
Write-Host " Joblio - Development Mode"
Write-Host "========================================"
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js $nodeVersion"
} catch {
    Write-Host "[ERROR] Node.js is not installed."
    Write-Host "Download from: https://nodejs.org/"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "[1/4] Installing dependencies..."
    npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed."
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "[1/4] Dependencies ready."
}

# Compile TypeScript
Write-Host ""
Write-Host "[2/4] Compiling backend..."
$env:npm_config_devdir = ""
npx --yes tsc -p electron/tsconfig.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] TypeScript compilation failed."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Compiled OK."

# Kill stale Vite on port 5174 if any
$stale = netstat -ano | findstr ":5174" | findstr "LISTENING"
if ($stale) {
    $pid = ($stale -split '\s+')[-1]
    Write-Host "Cleaning up stale Vite process (PID $pid)..."
    taskkill /F /PID $pid 2>$null
    Start-Sleep 1
}

# Start Vite
Write-Host ""
Write-Host "[3/4] Starting Vite dev server..."
$viteJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npx --yes vite --port 5174
} -ArgumentList (Get-Location)

# Wait for Vite to be ready
Write-Host "Waiting for Vite..."
Start-Sleep 5

# Check if Vite actually started
$viteInfo = netstat -ano | findstr ":5174" | findstr "LISTENING"
if (-not $viteInfo) {
    Write-Host "[ERROR] Vite failed to start. Check vite.log or port 5174 availability."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Vite is running on http://localhost:5174"

# Launch Electron
Write-Host ""
Write-Host "[4/4] Launching Electron app..."
$env:VITE_DEV_SERVER_URL = "http://localhost:5174"
npx --yes electron .

# Cleanup: stop Vite when Electron closes
Write-Host ""
Write-Host "Stopping Vite..."
Stop-Job $viteJob -ErrorAction SilentlyContinue
Remove-Job $viteJob -ErrorAction SilentlyContinue

Write-Host "App closed."
Read-Host "Press Enter to exit"
