# 🎬 Kinoflex — бесплатный онлайн кинотеатр + Telegram-бот с психотестом

Проект из двух частей:

1. **Сайт-кинотеатр** (`/`, `/assets`, `/data`) — статический сайт для GitHub Pages
   в стиле современных онлайн-кинотеатров (тёмная тема, сетка постеров, фильтры
   по жанрам, поиск, страница фильма со встроенным плеером).
2. **Telegram-бот** (`/bot`) — подбирает фильмы по психологическому тесту.

> ⚖️ **О легальности.** Сайт **не размещает пиратский контент.** В плеере
> доступны только фильмы, перешедшие в **общественное достояние (public domain)**
> — их законно смотреть и распространять. Они встраиваются с [archive.org](https://archive.org).
> Для остального каталога показываются только метаданные (постеры, описания,
> рейтинги, трейлеры), данные предоставлены [TMDB](https://www.themoviedb.org/).

## ✨ Возможности сайта

- Тёмная адаптивная тема, сетка постеров с ховер-карточками и рейтингами.
- Hero-баннер, разделы «Популярное», «Смотреть бесплатно», ряды по жанрам.
- Фильтры по жанрам, поиск, пагинация («Загрузить ещё»).
- Карточка фильма со встроенным плеером (public-domain) или трейлером.
- «Вы недавно смотрели» — история через `localStorage`.
- Промо-баннер Telegram-бота с психотестом.
- Работает **без ключей** на локальном каталоге; TMDB-ключ расширяет базу.

## 📁 Структура

```
.
├── index.html              # сайт (SPA на ванильном JS)
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── config.js       # настройки: имя сайта, TMDB-ключ, ссылка на бота
│       ├── api.js          # слой данных: локальный каталог + TMDB
│       ├── ui.js           # рендер карточек/страниц/плеера + история
│       └── app.js          # роутинг, поиск, фильтры, модалка
├── data/
│   └── catalog.json        # ЕДИНЫЙ каталог public-domain фильмов (сайт + бот)
├── bot/                    # Telegram-бот (Python) — см. bot/README.md
└── .nojekyll               # чтобы GitHub Pages отдавал папки assets/data
```

## 🚀 Запуск сайта

### Локально
Откройте `index.html` через локальный сервер (нужен для загрузки `data/catalog.json`):

```bash
python -m http.server 8000
# затем откройте http://localhost:8000
```

### На GitHub Pages
Это репозиторий вида `username.github.io`, поэтому сайт публикуется автоматически
из ветки по умолчанию. Слейте ветку с изменениями в основную (`master`/`main`) —
сайт появится по адресу `https://<username>.github.io/`.

### Настройка
Откройте `assets/js/config.js`:
- `siteName` — название кинотеатра;
- `tmdbApiKey` — (необязательно) бесплатный ключ TMDB для большой базы фильмов;
- `telegramBotUrl` — ссылка на вашего Telegram-бота.

## 🎞 Как добавить фильм в бесплатный каталог

1. Найдите public-domain фильм на [archive.org](https://archive.org).
2. Скопируйте идентификатор из URL: `archive.org/details/ИДЕНТИФИКАТОР`.
3. Добавьте объект в `data/catalog.json` → `movies`, указав `archiveId` и жанры
   (ID жанров — в начале того же файла).

## 🤖 Telegram-бот

См. [`bot/README.md`](bot/README.md). Кратко:

```bash
cd bot
pip install -r requirements.txt
cp .env.example .env     # впишите TELEGRAM_BOT_TOKEN от @BotFather
python bot.py
```

Бот и сайт используют один и тот же `data/catalog.json`, так что жанры
и рекомендации согласованы.

## 🔗 Phase 2: вход через Telegram + единый профиль

Сайт умеет логиниться через **Telegram Login Widget** и синхронизировать оценки
и модель вкуса с ботом — единый профиль для сайта и бота. Это требует
запущенного **веб-API** (`bot/web_api.py`), который делит ту же базу SQLite, что и бот.

Форматы данных специально совместимы: ключи фильмов (`tmdb:603`, локальные id)
и признаки модели (`g:27`, `era:1990s`, `recent`) одинаковы в боте и на сайте.

### Вариант A — Vercel + Turso (serverless, рекомендуется)

API развёрнут как serverless-функция (`api/index.py` → Flask `bot/web_api.py`),
а общая база — **Turso** (libSQL, SQLite-совместимая).

1. **База Turso.** На [turso.tech](https://turso.tech): создайте БД, получите
   `TURSO_DATABASE_URL` (`libsql://…`) и `TURSO_AUTH_TOKEN`.
2. **Деплой API на Vercel.** Импортируйте репозиторий на [vercel.com](https://vercel.com)
   (Framework = Other). В **Settings → Environment Variables** задайте:
   `TELEGRAM_BOT_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
   `CORS_ORIGIN=https://<username>.github.io`. Деплой → получите URL вида
   `https://kinoflex.vercel.app` (проверка: `GET /` вернёт `{"ok": true}`).
3. **Бот с той же базой.** Запустите бота (локально/где угодно), задав те же
   `TURSO_DATABASE_URL` и `TURSO_AUTH_TOKEN` — тогда бот и сайт делят один профиль.
   *(libSQL ставится отдельно: `pip install libsql-experimental`.)*
4. **@BotFather → `/setdomain`** → `https://<username>.github.io` (без этого виджет входа не появится).
5. В `assets/js/config.js`: `apiBaseUrl` = адрес Vercel, `telegramBotName` = имя бота без `@`. Закоммитьте.

`vercel.json` маршрутизирует все запросы на функцию; `requirements.txt` в корне —
зависимости функции (без тяжёлого PTB).

### Вариант B — Docker (свой сервер/VPS, без serverless)

```bash
cp bot/.env.example bot/.env     # TELEGRAM_BOT_TOKEN, CORS_ORIGIN=https://<username>.github.io
docker compose up --build -d     # bot + api (порт 8080), общий том — единая база
```

Затем в `config.js` укажите `apiBaseUrl` на адрес вашего сервера.

> Пока `apiBaseUrl` пуст, вход выключен, а сайт работает на локальном профиле
> (localStorage) — как и раньше.

### Эндпоинты API
- `POST /api/auth/telegram` — проверка подписи Telegram, выдача сессии (HMAC).
- `GET /api/profile` — оценки, веса модели, любимые жанры.
- `PUT /api/profile` — слить локальные оценки сайта в аккаунт.
- `POST /api/rate` — оценить фильм (обновляет модель вкуса в аккаунте).
