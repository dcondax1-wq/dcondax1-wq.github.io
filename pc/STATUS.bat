@echo off
set "LE_HOME=%~dp0"
if not exist "%~dp0engine\" if exist "%~dp0..\..\engine\" for %%I in ("%~dp0..\..") do set "LE_HOME=%%~fI\"
rem Liquidity Engine: STATUS (double-click). A six line health card for THIS PC: free disk, free memory, is the bot running and armed (from
rem the heartbeat the bot PC publishes), is NinjaTrader running, how old the last 1-minute bar is, the power plan. It only looks: nothing is
rem changed, closed, deleted or installed, and no Administrator is needed. It ends with ONE sentence of what to do. Works on the main PC
rem and on the Surface. Works from the bot folder, or downloaded alone (then it fetches the script from
rem https://dcondax1-wq.github.io/pc/). docs\PC_PERFORMANCE.md
rem security 2026-11-23: alone, the downloaded script runs ONLY when its sha256 equals the one pinned below
rem (the copy in scripts\ from the auto-updated checkout is always preferred). tests/test_pc_care.py checks the pin.
setlocal EnableExtensions
title Liquidity Engine - STATUS
cd /d "%LE_HOME%"
where powershell >nul 2>&1
if errorlevel 1 goto :nops
if exist "%LE_HOME%scripts\pc_status.ps1" goto :local
goto :web

:local
powershell -NoProfile -ExecutionPolicy Bypass -File "%LE_HOME%scripts\pc_status.ps1" %* & echo. & pause & exit /b

:web
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Join-Path $env:TEMP 'le_pc_status.ps1'; $pin = '73b82bbdcd34cc13a939efdc46794c4199e685ef577425c512337c5857f472cf'; try { Invoke-WebRequest -Uri 'https://dcondax1-wq.github.io/pc/pc_status.ps1' -OutFile $t -UseBasicParsing -TimeoutSec 60 } catch { Write-Host '  [FIX] Could not download STATUS. Check the internet and double-click again, or send Claude a photo of this window.'; exit 1 }; $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $t).Hash.ToLower(); if ($h -ne $pin) { Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue; Write-Host '  [FIX] The downloaded STATUS script is not the one this file expects (its fingerprint differs), so it was NOT run. Run it from the bot folder (tools\bat), or send Claude a photo of this window.'; exit 1 }; & powershell -NoProfile -ExecutionPolicy Bypass -File $t" & echo. & pause & exit /b

:nops
echo  [FIX] Windows PowerShell not found. Send a photo of this window to Claude.
echo.
pause
endlocal
