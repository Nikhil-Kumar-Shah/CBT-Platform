@echo off
REM ==============================================================================
REM CBT Examination Platform — Database Cleanup Batch Script (Windows)
REM ==============================================================================

setlocal
set SCRIPT_DIR=%~dp0

if exist "%SCRIPT_DIR%.venv\Scripts\python.exe" (
    "%SCRIPT_DIR%.venv\Scripts\python.exe" "%SCRIPT_DIR%scripts\clean_database.py" %*
) else (
    python "%SCRIPT_DIR%scripts\clean_database.py" %*
)
endlocal
