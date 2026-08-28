@echo off
echo.
echo ============================================
echo  Joblio Cloud Monitor v1.4 INSTALL
echo  Close any old "Joblio Stack Monitor" first
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%~dp0Install-JoblioCloudMonitor.ps1\"\"'"
