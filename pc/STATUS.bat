@echo off
rem Liquidity Engine: STATUS (double-click). A six line health card for THIS PC: free disk, free memory, is the bot running and armed (from
rem the heartbeat the bot PC publishes), is NinjaTrader running, how old the last 1-minute bar is, the power plan. It only looks: nothing is
rem changed, closed, deleted or installed, and no Administrator is needed. It ends with ONE sentence of what to do. Works on the main PC
rem and on the Surface. Works from the bot folder, or downloaded alone (then it fetches the script from
rem https://dcondax1-wq.github.io/pc/). docs\PC_PERFORMANCE.md
setlocal EnableExtensions
title Liquidity Engine - STATUS
cd /d "%~dp0"
where powershell >nul 2>&1
if errorlevel 1 goto :nops
if exist "%~dp0scripts\pc_status.ps1" goto :local
goto :web

:local
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pc_status.ps1" %* & echo. & pause & exit /b

:web
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Join-Path $env:TEMP 'le_pc_status.ps1'; try { Invoke-WebRequest -Uri 'https://dcondax1-wq.github.io/pc/pc_status.ps1' -OutFile $t -UseBasicParsing -TimeoutSec 60 } catch { Write-Host '  [FIX] Could not download STATUS. Check the internet and double-click again, or send Claude a photo of this window.'; exit 1 }; & powershell -NoProfile -ExecutionPolicy Bypass -File $t" & echo. & pause & exit /b

:nops
echo  [FIX] Windows PowerShell not found. Send a photo of this window to Claude.
echo.
pause
endlocal
