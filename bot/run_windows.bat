@echo off
setlocal
cd /d "%~dp0"
title KinoVolt Telegram bot

echo ====================================================
echo            KINOVOLT - Telegram bot launcher
echo ====================================================
echo.

REM --- Find a WORKING Python. Prefer the "py" launcher over "python",
REM --- because on Windows "python" is often the Microsoft Store stub. ---
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY goto nopython

REM --- Make sure the interpreter actually runs (not a Store stub) ---
%PY% --version >nul 2>nul
if errorlevel 1 goto nopython
goto haspython

:nopython
echo [ERROR] Python is not installed ^(or only the Microsoft Store stub is present^).
echo.
echo 1. Install Python from:  https://www.python.org/downloads/
echo 2. On the FIRST install screen CHECK "Add python.exe to PATH", then Install Now.
echo 3. Run this file again.
echo.
pause
exit /b 1

:haspython
echo Using Python:
%PY% --version
echo.

REM --- Ask for the bot token on first run ---
if exist token.txt goto deps
echo Open @BotFather in Telegram, copy your bot token, and paste it here.
echo ^(right-click in this window usually pastes^)
echo.
set /p TOKEN="Paste bot token and press Enter: "
>token.txt echo %TOKEN%
echo.
echo Token saved to token.txt
echo.

:deps
echo Installing dependencies ^(first run only, may take a minute^)...
%PY% -m pip install --upgrade pip
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [ERROR] Could not install dependencies.
  echo Scroll up to read the real error, or send a screenshot.
  pause
  exit /b 1
)
echo.
echo ====================================================
echo   Bot is starting! Open in Telegram: @movie_o_bot
echo   To stop the bot, just close this window.
echo ====================================================
echo.
%PY% bot.py
echo.
echo Bot stopped.
pause
