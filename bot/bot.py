"""Telegram-бот «КиноВольт»: подбор фильмов с памятью вкуса.

Воронка (мягкая):
  /start → выбор жанров (включая мультфильмы и аниме)
         → «Тиндер» по фильмам (❤️/👎)
         → когда пользователь вовлёкся, бот НЕНАВЯЗЧИВО предлагает мини-психотест
         → личный список «Мои фильмы» + умная подборка

Профиль и оценки хранятся в SQLite (storage.py).
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

import genres as genres_mod
import quiz
import storage
from catalog import genre_name
from recommender import Recommender, effective_genres

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

recommender = Recommender()

DECK_BATCH = 12      # сколько карточек подгружать за раз
OFFER_AFTER = 6      # после скольких свайпов мягко предложить психотест


def _read_token() -> str:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if token:
        return token
    path = os.path.join(os.path.dirname(__file__), "token.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


# =====================================================================
#  Клавиатуры и тексты
# =====================================================================
WELCOME = (
    "🎬 <b>Привет, {name}!</b>\n"
    "Я КиноВольт — помогу выбрать, что посмотреть сегодня.\n\n"
    "Для начала отметь жанры, которые тебе нравятся 👇\n"
    "<i>(можно несколько — или сразу жми «Готово», чтобы смотреть всё подряд)</i>"
)


def genre_select_kb(selected: set) -> InlineKeyboardMarkup:
    rows, row = [], []
    for g in genres_mod.MAIN_GENRES:
        mark = "✅ " if g["key"] in selected else ""
        row.append(
            InlineKeyboardButton(
                f"{mark}{g['emoji']} {g['label']}", callback_data=f"g:toggle:{g['key']}"
            )
        )
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton("Готово ✅", callback_data="g:done")])
    return InlineKeyboardMarkup(rows)


def main_menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🎬 Листать фильмы", callback_data="menu:swipe")],
            [
                InlineKeyboardButton("🎚 Жанры", callback_data="menu:genres"),
                InlineKeyboardButton("🧠 Психотест", callback_data="menu:test"),
            ],
            [
                InlineKeyboardButton("❤️ Мои фильмы", callback_data="menu:mymovies"),
                InlineKeyboardButton("✨ Подборка", callback_data="menu:recommend"),
            ],
        ]
    )


def swipe_kb(key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("❤️ Нравится", callback_data=f"sw:like:{key}"),
                InlineKeyboardButton("👎 Не нравится", callback_data=f"sw:dislike:{key}"),
            ],
            [InlineKeyboardButton("🛑 Хватит, покажи подборку", callback_data="sw:stop")],
        ]
    )


def quiz_question_kb(q_idx: int) -> InlineKeyboardMarkup:
    options = quiz.QUESTIONS[q_idx]["options"]
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton(opt["label"], callback_data=f"ans:{q_idx}:{i}")]
            for i, opt in enumerate(options)
        ]
    )


def quiz_question_text(q_idx: int) -> str:
    total = len(quiz.QUESTIONS)
    return f"<b>Вопрос {q_idx + 1}/{total}</b>\n\n{html.escape(quiz.QUESTIONS[q_idx]['text'])}"


def movie_caption(movie: dict) -> str:
    title = html.escape(movie.get("title", ""))
    year = f" ({movie['year']})" if movie.get("year") else ""
    rating = f"  ⭐️ {movie['rating']}" if movie.get("rating") else ""
    gnames = ", ".join(genre_name(g) for g in movie.get("genres", []) if genre_name(g))
    gline = f"\n🎭 {html.escape(gnames)}" if gnames else ""
    free = "\n🆓 <i>Доступно бесплатно (public domain)</i>" if movie.get("free") else ""
    overview = (movie.get("overview") or "").strip()
    if len(overview) > 500:
        overview = overview[:497].rstrip() + "…"
    over = f"\n\n{html.escape(overview)}" if overview else ""
    return f"<b>{title}</b>{year}{rating}{gline}{over}{free}"


# =====================================================================
#  Команды
# =====================================================================
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    storage.upsert_user(user.id, user.first_name or "", user.username or "")
    context.user_data.clear()
    context.user_data["genre_sel"] = set(storage.get_preferred_genres(user.id))
    await update.message.reply_text(
        WELCOME.format(name=html.escape(user.first_name or "")),
        parse_mode=ParseMode.HTML,
        reply_markup=genre_select_kb(context.user_data["genre_sel"]),
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Команды:\n"
        "/start — начать заново (выбор жанров)\n"
        "/swipe — листать и оценивать фильмы\n"
        "/genres — изменить любимые жанры\n"
        "/mymovies — мой список (что понравилось)\n"
        "/recommend — персональная подборка\n"
        "/test — психотест (точнее подбор)\n"
        "/reset — очистить профиль"
    )


async def cmd_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Главное меню:", reply_markup=main_menu_kb())


# =====================================================================
#  Выбор жанров (старт воронки)
# =====================================================================
async def open_genre_selector(context, chat_id, user_id, text) -> None:
    context.user_data["genre_sel"] = set(storage.get_preferred_genres(user_id))
    await context.bot.send_message(
        chat_id, text, parse_mode=ParseMode.HTML,
        reply_markup=genre_select_kb(context.user_data["genre_sel"]),
    )


async def cmd_genres(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await open_genre_selector(
        context, update.effective_chat.id, update.effective_user.id,
        "Отметь жанры, которые тебе нравятся:",
    )


async def on_genre_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    key = query.data.split(":", 2)[2]
    sel = context.user_data.get("genre_sel")
    if sel is None:
        sel = set(storage.get_preferred_genres(update.effective_user.id))
    if key in sel:
        sel.discard(key)
    else:
        sel.add(key)
    context.user_data["genre_sel"] = sel
    await query.answer()
    try:
        await query.edit_message_reply_markup(genre_select_kb(sel))
    except Exception:  # noqa: BLE001
        pass


async def on_genre_done(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    user_id = update.effective_user.id
    sel = context.user_data.get("genre_sel") or set()
    storage.set_preferred_genres(user_id, list(sel))
    chosen = ", ".join(genres_mod.label(k) for k in sel) if sel else "все жанры"
    await query.edit_message_text(
        f"Отлично! Показываю: <b>{html.escape(chosen)}</b>.\nЛистай и отмечай ❤️/👎 👇",
        parse_mode=ParseMode.HTML,
    )
    await start_deck(context, query.message.chat_id, user_id)


# =====================================================================
#  «Тиндер для фильмов»
# =====================================================================
def get_effective_genres(user_id: int) -> list:
    user = storage.get_user(user_id)
    quiz_scores = user.get("quiz_scores", {}) if user else {}
    affinity = storage.get_genre_affinity(user_id)
    return effective_genres(quiz_scores, affinity, top_n=4)


def get_user_categories(user_id: int) -> list:
    """Категории для подбора: выбранные жанры, иначе — выученные из теста/оценок."""
    prefs = storage.get_preferred_genres(user_id)
    if prefs:
        return prefs
    return [str(g) for g in get_effective_genres(user_id)]


async def start_deck(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user_id: int) -> None:
    categories = get_user_categories(user_id)
    exclude = storage.get_rated_keys(user_id)
    context.user_data["deck_categories"] = categories
    context.user_data["deck_page"] = 1
    context.user_data["deck_map"] = {}
    context.user_data["swipes_session"] = 0
    await context.bot.send_chat_action(chat_id, ChatAction.TYPING)
    pool = await asyncio.to_thread(
        recommender.candidate_pool, categories, exclude, DECK_BATCH, 1
    )
    context.user_data["deck"] = pool
    if not pool:
        await context.bot.send_message(
            chat_id,
            "Под этот выбор фильмов не нашлось 😕\n"
            "Измени жанры (/genres) или загляни в ❤️ /mymovies.",
            reply_markup=main_menu_kb(),
        )
        return
    await send_next_card(context, chat_id, user_id)


async def send_next_card(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user_id: int) -> None:
    deck = context.user_data.get("deck", [])
    if not deck:
        categories = context.user_data.get("deck_categories", [])
        page = context.user_data.get("deck_page", 1) + 1
        exclude = storage.get_rated_keys(user_id)
        more = await asyncio.to_thread(
            recommender.candidate_pool, categories, exclude, DECK_BATCH, page
        )
        context.user_data["deck_page"] = page
        deck.extend(more)
        if not deck:
            await finish_deck(context, chat_id, user_id)
            return
    movie = deck.pop(0)
    await send_card(context, chat_id, movie)


async def send_card(context: ContextTypes.DEFAULT_TYPE, chat_id: int, movie: dict) -> None:
    context.user_data.setdefault("deck_map", {})[movie["key"]] = movie
    caption = movie_caption(movie)
    kb = swipe_kb(movie["key"])
    poster = movie.get("poster")
    try:
        if poster:
            await context.bot.send_photo(
                chat_id, poster, caption=caption, parse_mode=ParseMode.HTML, reply_markup=kb
            )
        else:
            await context.bot.send_message(
                chat_id, caption, parse_mode=ParseMode.HTML, reply_markup=kb
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Постер не отправился (%s): %s", poster, exc)
        await context.bot.send_message(
            chat_id, caption, parse_mode=ParseMode.HTML, reply_markup=kb
        )


async def offer_quiz(context: ContextTypes.DEFAULT_TYPE, chat_id: int) -> None:
    await context.bot.send_message(
        chat_id,
        "🧠 А ты уже распробовал! Хочешь, чтобы я попадал ещё точнее?\n"
        "Пройди мини-тест характера — это меньше минуты. Или просто листай дальше.",
        reply_markup=InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("🧠 Пройти мини-тест", callback_data="quiz:start")],
                [InlineKeyboardButton("👉 Продолжить листать", callback_data="sw:more")],
            ]
        ),
    )


async def on_swipe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    user_id = update.effective_user.id
    _, action, key = query.data.split(":", 2)

    movie = context.user_data.get("deck_map", {}).pop(key, None)
    if movie is None:
        await query.answer("Эта карточка устарела, листаем дальше")
        await send_next_card(context, query.message.chat_id, user_id)
        return

    value = storage.LIKE if action == "like" else storage.DISLIKE
    storage.add_rating(user_id, movie, value)
    verdict = "❤️ В избранном" if action == "like" else "👎 Не интересно"
    await query.answer(verdict)
    try:
        new_caption = movie_caption(movie) + f"\n\n<b>{verdict}</b>"
        if query.message.photo:
            await query.edit_message_caption(new_caption, parse_mode=ParseMode.HTML)
        else:
            await query.edit_message_text(new_caption, parse_mode=ParseMode.HTML)
    except Exception:  # noqa: BLE001
        pass

    # Мягкое предложение психотеста — только когда пользователь вовлёкся
    sess = context.user_data.get("swipes_session", 0) + 1
    context.user_data["swipes_session"] = sess
    user = storage.get_user(user_id)
    quiz_done = bool(user and user.get("archetype"))
    if (not quiz_done) and (not context.user_data.get("offered_quiz")) and sess >= OFFER_AFTER:
        context.user_data["offered_quiz"] = True
        await offer_quiz(context, query.message.chat_id)
        return

    await send_next_card(context, query.message.chat_id, user_id)


async def on_swipe_more(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    try:
        await query.edit_message_reply_markup(None)
    except Exception:  # noqa: BLE001
        pass
    await send_next_card(context, query.message.chat_id, update.effective_user.id)


async def on_swipe_stop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    try:
        await query.edit_message_reply_markup(None)
    except Exception:  # noqa: BLE001
        pass
    await finish_deck(context, query.message.chat_id, update.effective_user.id)


async def finish_deck(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user_id: int) -> None:
    context.user_data.pop("deck", None)
    context.user_data.pop("deck_map", None)
    stats = storage.get_stats(user_id)
    await context.bot.send_message(
        chat_id,
        f"📊 Готово! Оценено фильмов: <b>{stats['total']}</b> "
        f"(❤️ {stats['liked']} · 👎 {stats['disliked']}).\n\n"
        f"Я запомнил твой вкус. Что дальше?",
        parse_mode=ParseMode.HTML,
        reply_markup=main_menu_kb(),
    )


# =====================================================================
#  Психотест (предлагается мягко, по ходу)
# =====================================================================
async def start_quiz(query, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data["answers"] = []
    context.user_data["q"] = 0
    await query.edit_message_text(
        quiz_question_text(0), parse_mode=ParseMode.HTML, reply_markup=quiz_question_kb(0)
    )


async def cmd_test(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data["answers"] = []
    context.user_data["q"] = 0
    await update.message.reply_text(
        quiz_question_text(0), parse_mode=ParseMode.HTML, reply_markup=quiz_question_kb(0)
    )


async def on_quiz_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.callback_query.answer()
    await start_quiz(update.callback_query, context)


async def on_answer(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    _, q_str, opt_str = query.data.split(":")
    q_idx, opt_idx = int(q_str), int(opt_str)

    answers = context.user_data.setdefault("answers", [])
    if context.user_data.get("q") != q_idx:
        return
    answers.append((q_idx, opt_idx))

    next_q = q_idx + 1
    if next_q < len(quiz.QUESTIONS):
        context.user_data["q"] = next_q
        await query.edit_message_text(
            quiz_question_text(next_q),
            parse_mode=ParseMode.HTML,
            reply_markup=quiz_question_kb(next_q),
        )
    else:
        await finish_quiz(update, context)


async def finish_quiz(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    user_id = update.effective_user.id
    answers = context.user_data.get("answers", [])

    scores = quiz.score(answers)
    archetype = quiz.detect_archetype(scores)
    storage.set_quiz_result(user_id, archetype["key"], scores)

    top = quiz.top_genres(scores, n=3)
    genre_titles = ", ".join(genre_name(g) for g in top if genre_name(g))
    await query.edit_message_text(
        f"✨ <b>Твой психотип: {html.escape(archetype['title'])}</b>\n\n"
        f"{html.escape(archetype['desc'])}\n\n"
        f"🎯 Любимые жанры: <b>{html.escape(genre_titles)}</b>\n\n"
        f"Теперь подбор будет ещё точнее. Продолжаем 👇",
        parse_mode=ParseMode.HTML,
    )
    context.user_data.pop("answers", None)
    context.user_data.pop("q", None)
    await start_deck(context, query.message.chat_id, user_id)


# =====================================================================
#  Мои фильмы / Подборка / Сброс
# =====================================================================
async def show_mymovies(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user_id: int) -> None:
    liked = storage.get_liked(user_id)
    if not liked:
        await context.bot.send_message(
            chat_id,
            "Твой список пока пуст. Отмечай фильмы ❤️ — и они появятся здесь.",
            reply_markup=main_menu_kb(),
        )
        return
    lines = []
    for m in liked[:30]:
        year = f" ({m['year']})" if m.get("year") else ""
        title = html.escape(m["title"])
        if m.get("url"):
            lines.append(f"• <a href=\"{html.escape(m['url'])}\">{title}</a>{year}")
        else:
            lines.append(f"• {title}{year}")
    await context.bot.send_message(
        chat_id,
        "❤️ <b>Мои фильмы</b> (понравились):\n\n" + "\n".join(lines),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
        reply_markup=main_menu_kb(),
    )


async def show_recommendations(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user_id: int) -> None:
    categories = get_user_categories(user_id)
    exclude = storage.get_rated_keys(user_id)
    affinity = storage.get_genre_affinity(user_id)
    await context.bot.send_chat_action(chat_id, ChatAction.TYPING)
    recs = await asyncio.to_thread(recommender.recommend, categories, exclude, affinity, 5)
    if not recs:
        await context.bot.send_message(
            chat_id,
            "Пока не могу подобрать новое 😔 Оцени ещё пару фильмов: /swipe",
            reply_markup=main_menu_kb(),
        )
        return
    await context.bot.send_message(
        chat_id, "✨ <b>Персональная подборка</b> — оцени и её:", parse_mode=ParseMode.HTML
    )
    for movie in recs:
        await send_card(context, chat_id, movie)


async def cmd_reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Очистить твой профиль (жанры, психотип и все оценки)?",
        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("Да, сбросить", callback_data="reset:yes"),
                    InlineKeyboardButton("Отмена", callback_data="reset:no"),
                ]
            ]
        ),
    )


# =====================================================================
#  Меню (callbacks)
# =====================================================================
async def on_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    action = query.data.split(":", 1)[1]
    chat_id = query.message.chat_id
    user_id = update.effective_user.id

    if action == "swipe":
        await start_deck(context, chat_id, user_id)
    elif action == "genres":
        await open_genre_selector(context, chat_id, user_id, "Отметь жанры, которые тебе нравятся:")
    elif action == "mymovies":
        await show_mymovies(context, chat_id, user_id)
    elif action == "recommend":
        await show_recommendations(context, chat_id, user_id)
    elif action == "test":
        await start_quiz(query, context)


async def on_reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    if query.data == "reset:yes":
        storage.reset_user(update.effective_user.id)
        context.user_data.clear()
        await query.edit_message_text("Профиль очищен. Начнём заново: /start")
    else:
        await query.edit_message_text("Отменено 👌")


# Команды, дублирующие действия меню
async def cmd_swipe(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await start_deck(context, update.effective_chat.id, update.effective_user.id)


async def cmd_mymovies(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await show_mymovies(context, update.effective_chat.id, update.effective_user.id)


async def cmd_recommend(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await show_recommendations(context, update.effective_chat.id, update.effective_user.id)


# =====================================================================
#  Запуск
# =====================================================================
def main() -> None:
    token = _read_token()
    if not token:
        raise SystemExit(
            "❌ Токен бота не найден.\n"
            "На Windows проще всего: дважды кликните bot/run_windows.bat — он спросит токен.\n"
            "Либо создайте файл bot/token.txt с токеном, либо задайте переменную "
            "окружения TELEGRAM_BOT_TOKEN (токен выдаёт @BotFather)."
        )

    storage.init_db()

    # Python 3.12+/3.14: run_polling() внутри вызывает asyncio.get_event_loop(),
    # который в новых версиях больше не создаёт цикл событий автоматически.
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("menu", cmd_menu))
    app.add_handler(CommandHandler("genres", cmd_genres))
    app.add_handler(CommandHandler("test", cmd_test))
    app.add_handler(CommandHandler("swipe", cmd_swipe))
    app.add_handler(CommandHandler("mymovies", cmd_mymovies))
    app.add_handler(CommandHandler("recommend", cmd_recommend))
    app.add_handler(CommandHandler("reset", cmd_reset))

    app.add_handler(CallbackQueryHandler(on_genre_toggle, pattern=r"^g:toggle:"))
    app.add_handler(CallbackQueryHandler(on_genre_done, pattern=r"^g:done$"))
    app.add_handler(CallbackQueryHandler(on_quiz_start, pattern=r"^quiz:start$"))
    app.add_handler(CallbackQueryHandler(on_answer, pattern=r"^ans:\d+:\d+$"))
    app.add_handler(CallbackQueryHandler(on_swipe_more, pattern=r"^sw:more$"))
    app.add_handler(CallbackQueryHandler(on_swipe_stop, pattern=r"^sw:stop$"))
    app.add_handler(CallbackQueryHandler(on_swipe, pattern=r"^sw:(like|dislike):"))
    app.add_handler(CallbackQueryHandler(on_reset, pattern=r"^reset:(yes|no)$"))
    app.add_handler(CallbackQueryHandler(on_menu, pattern=r"^menu:"))

    mode = "TMDB" if recommender.uses_tmdb else "локальный каталог"
    logger.info("Бот запущен. Источник рекомендаций: %s", mode)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
