@echo off
chcp 65001 >nul
cd /d "%~dp0"
title KinoVolt - Telegram bot

echo ====================================================
echo            KINOVOLT - запуск Telegram-бота
echo ====================================================
echo.

REM --- Проверка Python ---
where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python не найден.
  echo     Установите Python с https://www.python.org/downloads/
  echo     ВАЖНО: при установке поставьте галочку "Add Python to PATH".
  echo.
  pause
  exit /b 1
)

REM --- Запрос токена при первом запуске ---
if exist token.txt goto deps
echo Открой @BotFather в Telegram, получи токен и вставь его сюда.
echo (правый клик в окне обычно вставляет скопированный текст)
echo.
set /p TOKEN="Вставьте токен бота и нажмите Enter: "
echo %TOKEN%>token.txt
echo.
echo Токен сохранён в файл token.txt
echo.

:deps
echo Устанавливаю зависимости (один раз, может занять минуту)...
python -m pip install --upgrade pip >nul 2>nul
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo [!] Не удалось установить зависимости. Проверьте интернет и попробуйте снова.
  pause
  exit /b 1
)
echo.
echo ====================================================
echo   Бот запускается! Откройте в Telegram: @movie_o_bot
echo   Чтобы остановить бота — закройте это окно.
echo ====================================================
echo.
python bot.py
echo.
echo Бот остановлен.
pause
