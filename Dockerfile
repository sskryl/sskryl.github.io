# Контейнер для Telegram-бота «Kinoflex».
# Сборка из корня репозитория (нужны и bot/, и data/).
FROM python:3.11-slim

WORKDIR /app

# Зависимости (кэшируемый слой)
COPY bot/requirements.txt bot/requirements.txt
RUN pip install --no-cache-dir -r bot/requirements.txt

# Код бота и общий каталог фильмов
COPY bot/ bot/
COPY data/ data/

# Бот работает по long-polling, порт не нужен
CMD ["python", "bot/bot.py"]
