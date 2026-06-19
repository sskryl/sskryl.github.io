"""Психологический тест для подбора фильмов.

Каждый вариант ответа добавляет «вес» нескольким жанрам (ID совместимы с TMDB).
По сумме весов определяется психотип зрителя и топ жанров для рекомендаций.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Tuple

# --- ID жанров (как в TMDB) -------------------------------------------------
ACTION = 28
ADVENTURE = 12
ANIMATION = 16
COMEDY = 35
CRIME = 80
DOCUMENTARY = 99
DRAMA = 18
FAMILY = 10751
FANTASY = 14
HISTORY = 36
HORROR = 27
MYSTERY = 9648
ROMANCE = 10749
SCIFI = 878
THRILLER = 53
WAR = 10752

# --- Вопросы теста ----------------------------------------------------------
# weights: {genre_id: вес}
QUESTIONS: List[dict] = [
    {
        "text": "Какое у тебя сейчас настроение?",
        "options": [
            {"label": "😌 Спокойное, хочу расслабиться", "weights": {DRAMA: 2, ROMANCE: 2, FAMILY: 1}},
            {"label": "⚡ Бодрое, хочу драйва", "weights": {ACTION: 3, ADVENTURE: 2, THRILLER: 1}},
            {"label": "🤔 Задумчивое, хочу поразмышлять", "weights": {DRAMA: 2, MYSTERY: 2, SCIFI: 2}},
            {"label": "😈 Хочу пощекотать нервы", "weights": {HORROR: 3, THRILLER: 2, CRIME: 1}},
        ],
    },
    {
        "text": "Как для тебя выглядит идеальный вечер?",
        "options": [
            {"label": "🍵 Плед, чай и тишина", "weights": {FAMILY: 2, ROMANCE: 2, COMEDY: 1}},
            {"label": "🎉 Шумная компания друзей", "weights": {COMEDY: 3, ADVENTURE: 1}},
            {"label": "📚 В одиночестве с книгой", "weights": {DRAMA: 2, MYSTERY: 2, HISTORY: 1}},
            {"label": "🔥 Что-то экстремальное", "weights": {ACTION: 2, HORROR: 2, THRILLER: 1}},
        ],
    },
    {
        "text": "Ты по натуре скорее…",
        "options": [
            {"label": "🧩 Логик, обожаю головоломки", "weights": {MYSTERY: 3, CRIME: 2, SCIFI: 1}},
            {"label": "💖 Романтик, ценю чувства", "weights": {ROMANCE: 3, DRAMA: 2}},
            {"label": "🧭 Авантюрист, люблю риск", "weights": {ADVENTURE: 3, ACTION: 2}},
            {"label": "🌑 Скептик, тянет к мрачному", "weights": {HORROR: 2, THRILLER: 2, CRIME: 1}},
        ],
    },
    {
        "text": "Куда бы ты отправился в идеальное путешествие?",
        "options": [
            {"label": "🚀 В другую галактику", "weights": {SCIFI: 3, FANTASY: 2}},
            {"label": "🏰 В заброшенный старинный замок", "weights": {HORROR: 2, MYSTERY: 2, FANTASY: 1}},
            {"label": "🌆 В огромный шумный мегаполис", "weights": {CRIME: 2, DRAMA: 2, COMEDY: 1}},
            {"label": "🏔 В дикую нетронутую природу", "weights": {ADVENTURE: 3, FAMILY: 1}},
        ],
    },
    {
        "text": "Какой финал истории тебе ближе?",
        "options": [
            {"label": "😊 Счастливый, со слезами радости", "weights": {ROMANCE: 2, FAMILY: 2, COMEDY: 1}},
            {"label": "🌀 Неожиданный твист", "weights": {MYSTERY: 2, THRILLER: 2, SCIFI: 1}},
            {"label": "💔 Трагичный, но глубокий", "weights": {DRAMA: 3, WAR: 1, HISTORY: 1}},
            {"label": "👻 Чтобы было жутко до титров", "weights": {HORROR: 3}},
        ],
    },
    {
        "text": "Какой темп жизни тебе ближе?",
        "options": [
            {"label": "🐢 Медленный и вдумчивый", "weights": {DRAMA: 2, HISTORY: 2, ROMANCE: 1}},
            {"label": "🏎 Быстрый, на адреналине", "weights": {ACTION: 3, THRILLER: 1, ADVENTURE: 1}},
            {"label": "🎲 Непредсказуемый", "weights": {MYSTERY: 2, CRIME: 2, SCIFI: 1}},
            {"label": "🙂 Лёгкий и с юмором", "weights": {COMEDY: 3, FAMILY: 1}},
        ],
    },
    {
        "text": "Выбери цитату, которая откликается:",
        "options": [
            {"label": "«Любовь спасёт мир»", "weights": {ROMANCE: 3, DRAMA: 1}},
            {"label": "«Истина где-то рядом»", "weights": {SCIFI: 2, MYSTERY: 2}},
            {"label": "«Кто не рискует — тот не пьёт шампанского»", "weights": {ADVENTURE: 2, ACTION: 2}},
            {"label": "«Бойтесь своих желаний»", "weights": {HORROR: 2, THRILLER: 2}},
        ],
    },
    {
        "text": "Насколько ты готов к необычному и странному?",
        "options": [
            {"label": "🛸 Обожаю сюрреализм и странное", "weights": {SCIFI: 2, FANTASY: 2, HORROR: 1}},
            {"label": "🎞 Только проверенная классика", "weights": {DRAMA: 2, HISTORY: 2, ROMANCE: 1}},
            {"label": "🍿 Что-то лёгкое и понятное", "weights": {COMEDY: 2, FAMILY: 2}},
            {"label": "🩸 Тёмное и интенсивное", "weights": {CRIME: 2, THRILLER: 2, WAR: 1}},
        ],
    },
]

# --- Психотипы --------------------------------------------------------------
# Каждый типаж «притягивает» определённые жанры. Выбирается тот, чья сумма
# баллов по своим жанрам максимальна.
ARCHETYPES: List[dict] = [
    {
        "key": "adrenaline",
        "title": "🔥 Искатель адреналина",
        "desc": "Тебе нужны напряжение, страх и мурашки по коже. Ты любишь, когда сердце колотится, "
                "а сюжет держит в тонусе до последней минуты.",
        "genres": [HORROR, THRILLER],
    },
    {
        "key": "dreamer",
        "title": "🚀 Мечтатель-фантазёр",
        "desc": "Тебя тянет за пределы привычного — к иным мирам, технологиям будущего и магии. "
                "Кино для тебя — портал в невозможное.",
        "genres": [SCIFI, FANTASY],
    },
    {
        "key": "detective",
        "title": "🕵️ Аналитик-детектив",
        "desc": "Ты любишь распутывать загадки и просчитывать ходы. Тебе важны интрига, "
                "неожиданные повороты и игра ума.",
        "genres": [MYSTERY, CRIME],
    },
    {
        "key": "romantic",
        "title": "💖 Романтик-эмпат",
        "desc": "Ты ценишь живые эмоции и истории о людях. Тебе важно сопереживать героям "
                "и чувствовать вместе с ними.",
        "genres": [ROMANCE, DRAMA],
    },
    {
        "key": "soul",
        "title": "😄 Душа компании",
        "desc": "Тебе по душе лёгкость, юмор и тепло. Кино для тебя — способ улыбнуться "
                "и зарядиться хорошим настроением.",
        "genres": [COMEDY, FAMILY],
    },
    {
        "key": "adventurer",
        "title": "🧭 Авантюрист",
        "desc": "Ты вечно в движении и жаждешь приключений. Тебе нужны действие, размах "
                "и герои, которые не сидят на месте.",
        "genres": [ADVENTURE, ACTION],
    },
    {
        "key": "thinker",
        "title": "📜 Мыслитель-эрудит",
        "desc": "Тебя притягивают глубокие, серьёзные истории — о времени, истории и судьбах. "
                "Ты ищешь в кино смысл и пищу для размышлений.",
        "genres": [DRAMA, HISTORY, WAR],
    },
]


def score(answers: List[Tuple[int, int]]) -> Dict[int, int]:
    """Суммирует веса жанров по выбранным ответам.

    answers — список (индекс_вопроса, индекс_варианта).
    """
    totals: Dict[int, int] = defaultdict(int)
    for q_idx, opt_idx in answers:
        weights = QUESTIONS[q_idx]["options"][opt_idx]["weights"]
        for genre_id, w in weights.items():
            totals[genre_id] += w
    return dict(totals)


def top_genres(scores: Dict[int, int], n: int = 3) -> List[int]:
    """Топ-N жанров по баллам."""
    return [g for g, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:n]]


def detect_archetype(scores: Dict[int, int]) -> dict:
    """Выбирает психотип с максимальной суммой баллов по своим жанрам."""
    best = ARCHETYPES[0]
    best_score = -1
    for arch in ARCHETYPES:
        s = sum(scores.get(g, 0) for g in arch["genres"])
        if s > best_score:
            best_score = s
            best = arch
    return best
