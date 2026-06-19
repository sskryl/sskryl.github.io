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

## Память вкуса (SQLite)

Бот помнит каждого пользователя между запусками: психотип, оценки фильмов
(❤️/👎) и любимые жанры. Хранится в `bot/userdata.db` (SQLite, в `.gitignore`).
Благодаря этому:
- уже оценённые фильмы больше не предлагаются («что человек уже видел»);
- подборка учится на лайках/дизлайках и становится точнее;
- собирается личный список «Мои фильмы».

## Модель вкуса (онлайн-обучение)

`taste.py` — лёгкая логистическая регрессия (SGD). После **каждого** ответа
(психотест и каждый свайп) веса модели обновляются, и подбор сразу
пересортировывается под пользователя. Признаки: жанры, эпоха (десятилетие),
новизна. Веса хранятся в профиле (`taste_weights`).

Логика разнесена по модулям: `storage.py` (база), `quiz.py` (тест),
`genres.py` (жанры), `recommender.py` (пул + новинки), `taste.py` (ML-модель),
`bot.py` (диалог/воронка).

## Команды бота

- `/start` — знакомство, выбор жанров (включая мультфильмы и аниме)
- `/swipe` — «Тиндер»: оценивать фильмы ❤️/👎
- `/new` — современные фильмы и новинки
- `/genres` — изменить любимые жанры
- `/mymovies` — мой список (что понравилось)
- `/recommend` — персональная подборка (ML-ранжирование)
- `/test` — психотест (точнее подбор)
- `/reset` — очистить профиль
- `/help` — помощь

## Деплой

Бот работает по long-polling, ему нужен постоянно запущенный процесс.
В корне репозитория уже лежат готовые конфиги — выберите удобный способ.

### Вариант 1. Docker (универсально — VPS, Fly.io, Render, и т.д.)

```bash
# из корня репозитория
docker build -t kinovolt-bot .
docker run -e TELEGRAM_BOT_TOKEN=xxxxx -e TMDB_API_KEY=yyyyy kinovolt-bot
```

### Вариант 2. docker compose (одна команда)

```bash
cp bot/.env.example bot/.env   # вписать токен
docker compose up --build -d
```

### Вариант 3. Render (по блупринту)

`render.yaml` уже в корне. На [render.com](https://render.com): **New → Blueprint**,
выбрать этот репозиторий, затем в настройках сервиса задать `TELEGRAM_BOT_TOKEN`
(и при желании `TMDB_API_KEY`).

### Вариант 4. Railway / Heroku

Есть корневой `Procfile` (`worker: python bot/bot.py`) и `requirements.txt`.
Создайте проект из репозитория, добавьте переменные окружения и включите worker.

> ⚠️ Не забудьте задать переменные окружения `TELEGRAM_BOT_TOKEN`
> и (опционально) `TMDB_API_KEY`, `TMDB_LANGUAGE`.

После запуска вставьте username бота в `assets/js/config.js`
(`telegramBotUrl`), чтобы кнопки на сайте вели на бота.
