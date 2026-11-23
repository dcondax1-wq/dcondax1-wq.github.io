@echo off
set "LE_HOME=%~dp0"
if not exist "%~dp0engine\" if exist "%~dp0..\..\engine\" for %%I in ("%~dp0..\..") do set "LE_HOME=%%~fI\"
rem Liquidity Engine: CLEAN STORAGE (double-click). Frees disk space on this PC (Surface or main PC): it shows a plain table of
rem what it would free, asks Y, then clears ONLY safe things: temp files, browser caches, Windows Update download cache,
rem crash reports, old logs, NinjaTrader's own old log and trace files, the bot's old logs, backups, old code zips and
rem caches (__pycache__, the research replay cache), npm / pip caches; the Recycle Bin and Windows.old only if you say Y.
rem Windows asks once (click Yes) for its own part. A second drive (D: ...): one Y/N question to MOVE the bot's old archives
rem (data\_cfd_archive ...) there. Never touched: the bot's data and state, accounts, the bar archive, NinjaTrader's db,
rem workspaces, templates, settings and orders. If the bot or NinjaTrader is running, their folders are skipped and only
rem temp files, caches and Windows junk are cleaned. It ends with "Done: freed X GB".
rem Log: logs\clean_storage-YYYYMMDD-HHMM.txt. Table only, deletes nothing: CLEAN_STORAGE.bat -DryRun
rem Works from the bot folder, or downloaded alone (then it fetches the script from https://dcondax1-wq.github.io/pc/).
rem docs\PC_PERFORMANCE.md
rem security 2026-11-23: alone, the downloaded script runs ONLY when its sha256 equals the one pinned below
rem (the copy in scripts\ from the auto-updated checkout is always preferred). tests/test_pc_care.py checks the pin.
setlocal EnableExtensions
title Liquidity Engine - CLEAN STORAGE
cd /d "%LE_HOME%"
where powershell >nul 2>&1
if errorlevel 1 goto :nops
if exist "%LE_HOME%scripts\clean_storage.ps1" goto :local
goto :web

:local
powershell -NoProfile -ExecutionPolicy Bypass -File "%LE_HOME%scripts\clean_storage.ps1" %* & echo. & pause & exit /b

:web
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Join-Path $env:TEMP 'le_clean_storage.ps1'; $pin = '004890691df0df499ad60ac1b7da4877b61f445591776aa5062bd1f0ffefe51d'; try { Invoke-WebRequest -Uri 'https://dcondax1-wq.github.io/pc/clean_storage.ps1' -OutFile $t -UseBasicParsing -TimeoutSec 60 } catch { Write-Host '  [FIX] Could not download the cleaner. Check the internet and double-click again, or send Claude a photo of this window.'; exit 1 }; $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $t).Hash.ToLower(); if ($h -ne $pin) { Remove-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue; Write-Host '  [FIX] The downloaded CLEAN STORAGE script is not the one this file expects (its fingerprint differs), so it was NOT run. Run it from the bot folder (tools\bat), or send Claude a photo of this window.'; exit 1 }; & powershell -NoProfile -ExecutionPolicy Bypass -File $t" & echo. & pause & exit /b

:nops
echo  [FIX] Windows PowerShell not found. Send a photo of this window to Claude.
echo.
pause
endlocal
