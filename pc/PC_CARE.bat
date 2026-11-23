@echo off
set "LE_HOME=%~dp0"
if not exist "%~dp0engine\" if exist "%~dp0..\..\engine\" for %%I in ("%~dp0..\..") do set "LE_HOME=%%~fI\"
rem Liquidity Engine: PC CARE (double-click). Looks after THIS PC, the main PC (bot + NinjaTrader) or the Surface (hot, dark screen,
rem little memory): it shows a plain table (what it is now, what it will be), asks Y, then sets a power plan for the role (main PC:
rem never sleeps, high performance, USB suspend off; Surface: cooler, fan first, adaptive brightness off, battery saver does not
rem dim the screen while plugged in), offers to switch off startup apps (Y/N for each), background apps and visual effects, pauses
rem Windows search indexing during market hours, and ends with a health line (uptime, memory, disk, temperature when Windows shows it).
rem Windows asks once (click Yes) for the power plan. Everything is undone by UNDO_PC_TUNE.bat. Table only: PC_CARE.bat -DryRun
rem Health only: PC_CARE.bat -CheckOnly. NinjaTrader and the bot are never closed or touched.
rem Works from the bot folder, or downloaded alone (then it fetches the script from https://dcondax1-wq.github.io/pc/).
rem docs\PC_PERFORMANCE.md
rem security 2026-11-23: alone, the downloaded script runs ONLY when its sha256 equals the one pinned below
rem (the copy in scripts\ from the auto-updated checkout is always preferred). tests/test_pc_care.py checks the pin.
setlocal EnableExtensions
title Liquidity Engine - PC CARE
cd /d "%LE_HOME%"
where powershell >nul 2>&1
if errorlevel 1 goto :nops
if exist "%LE_HOME%scripts\pc_care.ps1" goto :local
goto :web

:local
powershell -NoProfile -ExecutionPolicy Bypass -File "%LE_HOME%scripts\pc_care.ps1" %* & echo. & pause & exit /b

:web
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Join-Path $env:TEMP 'le_pc_care.ps1'; $pin = 'b323003d088905403e85a58f0d049f089e81864165024d0ce76d90b32511bd9e'; try { Invoke-WebRequest -Uri 'https://dcondax1-wq.github.io/pc/pc_care.ps1' -OutFile $t -UseBasicParsing -TimeoutSec 60 } catch { Write-Host '  [FIX] Could not download PC Care. Check the internet and double-click again, or send Claude a photo of this window.'; exit 1 }; $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $t).Hash.ToLower(); if ($h -ne $pin) { Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue; Write-Host '  [FIX] The downloaded PC Care script is not the one this file expects (its fingerprint differs), so it was NOT run. Run it from the bot folder (tools\bat), or send Claude a photo of this window.'; exit 1 }; & powershell -NoProfile -ExecutionPolicy Bypass -File $t" & echo. & pause & exit /b

:nops
echo  [FIX] Windows PowerShell not found. Send a photo of this window to Claude.
echo.
pause
endlocal
