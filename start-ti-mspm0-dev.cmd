@echo off
cd /d "%~dp0"
call corepack pnpm dev:ti
if errorlevel 1 pause
