@echo off
REM Email Scheduler for Route Forecast PDFs
REM This script starts the Python email scheduler service

cd /d "%~dp0"

echo Starting Route Forecast Email Scheduler...
python email_scheduler.py

if errorlevel 1 (
    echo Error running scheduler
    pause
    exit /b 1
)
