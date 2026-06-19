"""Загрузка общего каталога фильмов (../data/catalog.json).

Тот же файл использует и сайт, и бот — единый источник данных.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Dict, List

# Путь к каталогу относительно этого файла: bot/ -> ../data/catalog.json
_CATALOG_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "data", "catalog.json")
)

ARCHIVE_IMG = "https://archive.org/services/img/"
ARCHIVE_DETAILS = "https://archive.org/details/"


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    """Читает и кэширует catalog.json."""
    with open(_CATALOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def genre_map() -> Dict[int, str]:
    """{genre_id: name}."""
    return {g["id"]: g["name"] for g in load_catalog().get("genres", [])}


def genre_name(genre_id: int) -> str:
    return genre_map().get(genre_id, "")


def local_movies() -> List[dict]:
    """Нормализованный список локальных public-domain фильмов."""
    movies = []
    for m in load_catalog().get("movies", []):
        archive_id = m.get("archiveId")
        movies.append(
            {
                "source": "local",
                "title": m["title"],
                "original_title": m.get("originalTitle", ""),
                "year": m.get("year"),
                "rating": m.get("rating"),
                "genres": m.get("genres", []),
                "overview": m.get("overview", ""),
                "poster": ARCHIVE_IMG + archive_id if archive_id else None,
                "url": ARCHIVE_DETAILS + archive_id if archive_id else None,
                "free": bool(archive_id),
            }
        )
    return movies
