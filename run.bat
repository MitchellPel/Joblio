@echo off
cd /d "%~dp0"
title Joblio

set npm_config_devdir=

echo ========================================
echo  Joblio - Development Mode
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found
node --version

if exist "node_modules" goto deps_ok

echo.
echo Installing dependencies...
call npm install --no-fund --no-audit
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)
goto compiled

:deps_ok
echo.
echo Dependencies ready.

:compiled
echo.
echo Compiling backend...
npx --yes tsc -p electron/tsconfig.json
if errorlevel 1 (
    echo ERROR: Compilation failed.
    pause
    exit /b 1
)
echo Compiled OK.

echo.
echo Starting Vite dev server...
start /B npx --yes vite --port 5174

echo Waiting 5 seconds for Vite to start...
timeout /t 5 /nobreak

echo Starting Electron...
set VITE_DEV_SERVER_URL=http://localhost:5174
npx --yes electron .

echo.
echo App closed.
pause
