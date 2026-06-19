@echo off
setlocal
cd /d "%~dp0"
title KinoVolt Telegram bot

echo ====================================================
echo            KINOVOLT - Telegram bot launcher
echo ====================================================
echo.

REM --- Find Python (python or py launcher) ---
set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY ( where py >nul 2>nul && set "PY=py" )
if not defined PY (
  echo [ERROR] Python is not installed ^(or not added to PATH^).
  echo.
  echo 1. Install Python from:  https://www.python.org/downloads/
  echo 2. On the FIRST install screen CHECK the box "Add Python to PATH".
  echo 3. Then run this file again.
  echo.
  pause
  exit /b 1
)

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
%PY% -m pip install --upgrade pip >nul 2>nul
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
  echo [ERROR] Could not install dependencies. Check your internet and try again.
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
