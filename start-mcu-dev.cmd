@echo off
cd /d "%~dp0"
call corepack pnpm dev:mcu
if errorlevel 1 pause
