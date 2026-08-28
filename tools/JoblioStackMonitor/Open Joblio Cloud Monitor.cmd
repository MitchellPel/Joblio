@echo off
title Joblio Cloud Monitor
set "APP=C:\Joblio-selfhost\monitor\JoblioCloudMonitor.exe"
if exist "%APP%" (
  start "" "%APP%"
  exit /b 0
)
echo.
echo  Joblio Cloud Monitor is not installed on this server yet.
echo.
echo  On the share, open this folder:
echo    Joblio Cloud Monitor\
echo.
echo  Run ONCE as Administrator:
echo    Install Joblio Cloud Monitor (once).exe
echo.
echo  After that, use this file every day:
echo    Open Joblio Cloud Monitor.cmd
echo.
pause
