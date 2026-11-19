@echo off
rem Liquidity Engine: CLEAN STORAGE (double-click). Frees disk space on this PC (Surface or main PC): it shows a plain table of
rem what it would free, asks Y, then clears ONLY safe things: temp files, browser caches, Windows Update download cache,
rem crash reports, old logs, NinjaTrader's own old log and trace files, the bot's old logs, backups, old code zips and
rem caches (__pycache__, the research replay cache), npm / pip caches; the Recycle Bin and Windows.old only if you say Y.
rem Windows asks once (click Yes) for its own part. A second drive (D: ...): one Y/N question to MOVE the bot's old archives
rem (data\_cfd_archive ...) there. Never touched: the bot's data and state, accounts, the bar archive, NinjaTrader's db,
rem workspaces, templates, settings and orders. If the bot or NinjaTrader is running, their folders are skipped and only
rem temp files, caches and Windows junk are cleaned. It ends with "Done: freed X GB".
rem Log: logs\clean_storage-YYYYMMDD-HHMM.txt. Table only, deletes nothing: CLEAN_STORAGE.bat -DryRun
rem Works from the bot folder, or downloaded alone (then it fetches the script from https://demetrades2000-coder.github.io/nq-dashboard/pc/).
rem docs\PC_PERFORMANCE.md
setlocal EnableExtensions
title Liquidity Engine - CLEAN STORAGE
cd /d "%~dp0"
where powershell >nul 2>&1
if errorlevel 1 goto :nops
if exist "%~dp0scripts\clean_storage.ps1" goto :local
goto :web

:local
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\clean_storage.ps1" %* & echo. & pause & exit /b

:web
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Join-Path $env:TEMP 'le_clean_storage.ps1'; try { Invoke-WebRequest -Uri 'https://demetrades2000-coder.github.io/nq-dashboard/pc/clean_storage.ps1' -OutFile $t -UseBasicParsing -TimeoutSec 60 } catch { Write-Host '  [FIX] Could not download the cleaner. Check the internet and double-click again, or send Claude a photo of this window.'; exit 1 }; & powershell -NoProfile -ExecutionPolicy Bypass -File $t" & echo. & pause & exit /b

:nops
echo  [FIX] Windows PowerShell not found. Send a photo of this window to Claude.
echo.
pause
endlocal
