"""Основные жанры для онбординга и фильтрации.

Ключ категории:
- числовая строка ("28", "16", ...) — это id жанра TMDB;
- "anime" — особая категория (TMDB: анимация + японский язык оригинала).

Аниме и большой каталог мультфильмов доступны при подключённом TMDB-ключе.
"""
from __future__ import annotations

from typing import List

MAIN_GENRES: List[dict] = [
    {"key": "28", "emoji": "💥", "label": "Боевик"},
    {"key": "12", "emoji": "🧭", "label": "Приключения"},
    {"key": "35", "emoji": "😂", "label": "Комедия"},
    {"key": "18", "emoji": "🎭", "label": "Драма"},
    {"key": "27", "emoji": "👻", "label": "Ужасы"},
    {"key": "53", "emoji": "🔪", "label": "Триллер"},
    {"key": "878", "emoji": "🚀", "label": "Фантастика"},
    {"key": "14", "emoji": "🐉", "label": "Фэнтези"},
    {"key": "9648", "emoji": "🕵️", "label": "Детектив"},
    {"key": "80", "emoji": "🚔", "label": "Криминал"},
    {"key": "10749", "emoji": "💕", "label": "Мелодрама"},
    {"key": "16", "emoji": "🧸", "label": "Мультфильмы"},
    {"key": "anime", "emoji": "🎌", "label": "Аниме"},
    {"key": "99", "emoji": "🎥", "label": "Документальные"},
]

GENRE_BY_KEY = {g["key"]: g for g in MAIN_GENRES}


def label(key: str) -> str:
    g = GENRE_BY_KEY.get(str(key))
    return f"{g['emoji']} {g['label']}" if g else str(key)


def numeric_ids(keys) -> List[int]:
    """Только числовые жанры (без спец-категорий типа 'anime')."""
    return [int(k) for k in (keys or []) if str(k).isdigit()]
