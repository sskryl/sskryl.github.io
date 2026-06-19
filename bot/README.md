# 🤖 КиноВольт — Telegram-бот с психотестом

Бот задаёт пользователю серию вопросов о настроении и характере, определяет его
«киногенный» психотип и подбирает фильмы под него.

- Без настройки рекомендует фильмы из **локального каталога** public-domain фильмов
  (`../data/catalog.json` — тот же, что и на сайте).
- С ключом **TMDB** подбирает фильмы из огромной базы The Movie Database.

## Как работает психотест

1. 8 вопросов, каждый ответ добавляет «вес» нескольким жанрам (ID совместимы с TMDB).
2. По сумме весов определяется психотип (`quiz.detect_archetype`) и топ-3 жанра.
3. По топ-жанрам подбираются фильмы (`recommender.Recommender.recommend`).

Файлы:
- `bot.py` — логика бота и диалога (python-telegram-bot v21, async).
- `quiz.py` — вопросы, скоринг и психотипы.
- `recommender.py` — подбор фильмов (TMDB / локальный каталог).
- `catalog.py` — загрузка общего каталога `../data/catalog.json`.

## Запуск локально

```bash
cd bot
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # впишите TELEGRAM_BOT_TOKEN
python bot.py
```

### Получить токен бота

1. Откройте в Telegram [@BotFather](https://t.me/BotFather).
2. `/newbot` → задайте имя и username.
3. Скопируйте выданный токен в `.env` → `TELEGRAM_BOT_TOKEN`.

### (Опционально) ключ TMDB

1. Зарегистрируйтесь на [themoviedb.org](https://www.themoviedb.org/).
2. Settings → API → получите **API Key (v3 auth)**.
3. Впишите в `.env` → `TMDB_API_KEY`.

## Команды бота

- `/start` — приветствие и кнопка запуска теста
- `/test` — пройти психотест
- `/help` — помощь

## Деплой

Бот работает по long-polling, ему нужен постоянно запущенный процесс.
Подойдёт любой бесплатный/дешёвый хостинг для Python-процесса
(Railway, Render, Fly.io, VPS, домашний сервер). Не забудьте задать
переменные окружения `TELEGRAM_BOT_TOKEN` и (опционально) `TMDB_API_KEY`.

После запуска бота вставьте его username в `assets/js/config.js`
(`telegramBotUrl`), чтобы кнопки на сайте вели на бота.
