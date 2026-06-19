"""Telegram-бот «КиноВольт»: подбор фильмов по психологическому тесту.

Пользователь проходит короткий тест, бот определяет его психотип и
рекомендует фильмы (из TMDB при наличии ключа, иначе из локального
каталога public-domain фильмов).

Запуск:
    pip install -r requirements.txt
    cp .env.example .env   # вписать TELEGRAM_BOT_TOKEN (и опционально TMDB_API_KEY)
    python bot.py
"""
from __future__ import annotations

import asyncio
import html
import logging
import os

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
)

import quiz
from catalog import genre_name
from recommender import Recommender

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

recommender = Recommender()

WELCOME = (
    "🎬 <b>Привет! Я КиноВольт-бот.</b>\n\n"
    "Не знаешь, что посмотреть? Я задам тебе несколько вопросов о настроении "
    "и характере, определю твой «киногенный» психотип и подберу фильмы под тебя.\n\n"
    "Это займёт меньше минуты. Поехали?"
)


# --------------------------------------------------------------------------- UI
def start_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("🧠 Пройти психотест", callback_data="quiz:start")]]
    )


def question_keyboard(q_idx: int) -> InlineKeyboardMarkup:
    options = quiz.QUESTIONS[q_idx]["options"]
    rows = [
        [InlineKeyboardButton(opt["label"], callback_data=f"ans:{q_idx}:{i}")]
        for i, opt in enumerate(options)
    ]
    return InlineKeyboardMarkup(rows)


def question_text(q_idx: int) -> str:
    total = len(quiz.QUESTIONS)
    q = quiz.QUESTIONS[q_idx]
    return f"<b>Вопрос {q_idx + 1}/{total}</b>\n\n{html.escape(q['text'])}"


# ------------------------------------------------------------------- handlers
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data.clear()
    await update.message.reply_text(
        WELCOME, parse_mode=ParseMode.HTML, reply_markup=start_keyboard()
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Я подбираю фильмы по психотесту.\n\n"
        "/start — начать заново\n"
        "/test — пройти тест\n\n"
        "Нажми кнопку под сообщением, чтобы выбрать ответ.",
    )


async def cmd_test(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data["answers"] = []
    context.user_data["q"] = 0
    await update.message.reply_text(
        question_text(0), parse_mode=ParseMode.HTML, reply_markup=question_keyboard(0)
    )


async def on_quiz_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    context.user_data["answers"] = []
    context.user_data["q"] = 0
    await query.edit_message_text(
        question_text(0), parse_mode=ParseMode.HTML, reply_markup=question_keyboard(0)
    )


async def on_answer(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    _, q_str, opt_str = query.data.split(":")
    q_idx, opt_idx = int(q_str), int(opt_str)

    answers = context.user_data.setdefault("answers", [])
    # Защита от повторного/устаревшего нажатия
    if context.user_data.get("q") != q_idx:
        return
    answers.append((q_idx, opt_idx))

    next_q = q_idx + 1
    if next_q < len(quiz.QUESTIONS):
        context.user_data["q"] = next_q
        await query.edit_message_text(
            question_text(next_q),
            parse_mode=ParseMode.HTML,
            reply_markup=question_keyboard(next_q),
        )
    else:
        await finish_quiz(update, context)


async def finish_quiz(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    answers = context.user_data.get("answers", [])
    context.user_data.clear()

    scores = quiz.score(answers)
    archetype = quiz.detect_archetype(scores)
    genres = quiz.top_genres(scores, n=3)
    genre_titles = ", ".join(genre_name(g) for g in genres if genre_name(g))

    result_text = (
        f"✨ <b>Твой психотип: {html.escape(archetype['title'])}</b>\n\n"
        f"{html.escape(archetype['desc'])}\n\n"
        f"🎯 Любимые жанры: <b>{html.escape(genre_titles)}</b>\n\n"
        f"Подбираю фильмы для тебя…"
    )
    await query.edit_message_text(result_text, parse_mode=ParseMode.HTML)

    chat_id = query.message.chat_id
    await context.bot.send_chat_action(chat_id, ChatAction.TYPING)

    # Сетевой запрос к TMDB — в отдельном потоке, чтобы не блокировать loop
    movies = await asyncio.to_thread(recommender.recommend, genres, 5)

    if not movies:
        await context.bot.send_message(
            chat_id, "Не удалось подобрать фильмы 😔 Попробуй пройти тест ещё раз: /test"
        )
        return

    src = "🎟 Из легального каталога" if not recommender.uses_tmdb else "🍿 Подборка по базе TMDB"
    await context.bot.send_message(chat_id, f"{src}. Вот что советую посмотреть:")

    for movie in movies:
        await send_movie(context, chat_id, movie)

    await context.bot.send_message(
        chat_id,
        "Хочешь другую подборку? Пройди тест ещё раз 👇",
        reply_markup=InlineKeyboardMarkup(
            [[InlineKeyboardButton("🔁 Пройти заново", callback_data="quiz:start")]]
        ),
    )


async def send_movie(context: ContextTypes.DEFAULT_TYPE, chat_id: int, movie: dict) -> None:
    title = html.escape(movie["title"])
    year = f" ({movie['year']})" if movie.get("year") else ""
    rating = f"  ⭐️ {movie['rating']}" if movie.get("rating") else ""
    free = "\n🆓 <i>Доступно бесплатно — фильм в общественном достоянии</i>" if movie.get("free") else ""

    overview = (movie.get("overview") or "").strip()
    if len(overview) > 600:
        overview = overview[:597].rstrip() + "…"
    if not overview:
        overview = "Описание недоступно."

    caption = f"<b>{title}</b>{year}{rating}\n\n{html.escape(overview)}{free}"

    keyboard = None
    if movie.get("url"):
        label = "▶️ Смотреть" if movie.get("free") else "ℹ️ Подробнее"
        keyboard = InlineKeyboardMarkup(
            [[InlineKeyboardButton(label, url=movie["url"])]]
        )

    poster = movie.get("poster")
    try:
        if poster:
            await context.bot.send_photo(
                chat_id, poster, caption=caption,
                parse_mode=ParseMode.HTML, reply_markup=keyboard,
            )
        else:
            await context.bot.send_message(
                chat_id, caption, parse_mode=ParseMode.HTML, reply_markup=keyboard
            )
    except Exception as exc:  # постер недоступен — шлём текстом  # noqa: BLE001
        logger.warning("Не удалось отправить постер (%s): %s", poster, exc)
        await context.bot.send_message(
            chat_id, caption, parse_mode=ParseMode.HTML, reply_markup=keyboard
        )


def _read_token() -> str:
    """Берёт токен из переменной окружения или из файла bot/token.txt.

    token.txt удобен для запуска на своём компьютере (его создаёт run_windows.bat).
    Файл добавлен в .gitignore и в репозиторий не попадает.
    """
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if token:
        return token
    path = os.path.join(os.path.dirname(__file__), "token.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


# ------------------------------------------------------------------- запуск
def main() -> None:
    token = _read_token()
    if not token:
        raise SystemExit(
            "❌ Токен бота не найден.\n"
            "На Windows проще всего: дважды кликните bot/run_windows.bat — он спросит токен.\n"
            "Либо создайте файл bot/token.txt с токеном, либо задайте переменную "
            "окружения TELEGRAM_BOT_TOKEN (токен выдаёт @BotFather)."
        )

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("test", cmd_test))
    app.add_handler(CallbackQueryHandler(on_quiz_start, pattern=r"^quiz:start$"))
    app.add_handler(CallbackQueryHandler(on_answer, pattern=r"^ans:\d+:\d+$"))

    mode = "TMDB" if recommender.uses_tmdb else "локальный каталог"
    logger.info("Бот запущен. Источник рекомендаций: %s", mode)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
