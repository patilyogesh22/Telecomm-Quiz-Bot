@echo off
title TeleBot — AI Telecomm Tutor
color 0B
cls
echo.
echo  =========================================
echo    TELEBOT — AI Telecomm Quiz and Tutor
echo  =========================================
echo.

REM ── Activate venv if it exists ────────────────────────────────
if exist "%~dp0venv\Scripts\activate.bat" (
    call "%~dp0venv\Scripts\activate.bat"
    echo  [OK] venv activated
) else (
    echo  [INFO] No venv found - using system Python
)
echo.

REM ── Start backend (reads GEMINI_API_KEY from backend/.env) ────
echo  Starting TeleBot on http://localhost:5000 ...
cd /d "%~dp0backend"
python app.py

pause