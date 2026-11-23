@echo off
set "LE_HOME=%~dp0"
if not exist "%~dp0engine\" if exist "%~dp0..\..\engine\" for %%I in ("%~dp0..\..") do set "LE_HOME=%%~fI\"
rem Liquidity Engine: FRESH START on the main PC (double-click). No old PC state needed: it checks the old PC is switched off,
rem installs Git and Python if missing, gets the bot, sets the eval numbers from the published board (you press Y) and starts
rem ONE_TIME_SETUP. Live trading is never turned on. Same as the one line in docs\MOVE_TO_MAIN_PC.md. Works from any folder.
setlocal EnableExtensions
title Liquidity Engine - FRESH START
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://dcondax1-wq.github.io/pc/FRESH_START.ps1 | iex" & echo. & pause & exit /b
