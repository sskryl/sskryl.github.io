"""Подбор фильмов по жанрам из психотеста.

Если задан TMDB_API_KEY — берёт фильмы из огромной базы TMDB.
Иначе — из локального каталога public-domain фильмов (catalog.py).
"""
from __future__ import annotations

import os
from typing import List

import requests

import catalog

TMDB_BASE = "https://api.themoviedb.org/3"
IMG_POSTER = "https://image.tmdb.org/t/p/w500"
TMDB_DETAILS = "https://www.themoviedb.org/movie/"


class Recommender:
    def __init__(self) -> None:
        self.api_key = (os.getenv("TMDB_API_KEY") or "").strip()
        self.language = os.getenv("TMDB_LANGUAGE", "ru-RU")

    @property
    def uses_tmdb(self) -> bool:
        return bool(self.api_key)

    # --------------------------------------------------------------- TMDB
    def _tmdb_discover(self, genre_ids: List[int], limit: int) -> List[dict]:
        params = {
            "api_key": self.api_key,
            "language": self.language,
            "with_genres": ",".join(str(g) for g in genre_ids),
            "sort_by": "popularity.desc",
            "vote_count.gte": 100,
            "page": 1,
        }
        resp = requests.get(f"{TMDB_BASE}/discover/movie", params=params, timeout=15)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        movies = []
        for m in results[:limit]:
            movies.append(
                {
                    "title": m.get("title") or m.get("original_title", ""),
                    "year": (m.get("release_date") or "")[:4],
                    "rating": round(m["vote_average"], 1) if m.get("vote_average") else None,
                    "overview": m.get("overview", ""),
                    "poster": IMG_POSTER + m["poster_path"] if m.get("poster_path") else None,
                    "url": TMDB_DETAILS + str(m["id"]),
                    "free": False,
                }
            )
        return movies

    # --------------------------------------------------------------- Локально
    def _local(self, genre_ids: List[int], limit: int) -> List[dict]:
        wanted = set(genre_ids)
        scored = []
        for m in catalog.local_movies():
            overlap = len(wanted & set(m["genres"]))
            if overlap:
                scored.append((overlap, m.get("rating") or 0, m))
        scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
        movies = [m for _, _, m in scored[:limit]]
        # Если совпадений мало — добиваем лучшими по рейтингу
        if len(movies) < limit:
            extra = sorted(
                catalog.local_movies(),
                key=lambda m: m.get("rating") or 0,
                reverse=True,
            )
            for m in extra:
                if m not in movies:
                    movies.append(m)
                if len(movies) >= limit:
                    break
        return movies[:limit]

    # --------------------------------------------------------------- API
    def recommend(self, genre_ids: List[int], limit: int = 5) -> List[dict]:
        if self.uses_tmdb:
            try:
                movies = self._tmdb_discover(genre_ids, limit)
                if movies:
                    return movies
            except Exception as exc:  # noqa: BLE001
                print(f"[recommender] TMDB ошибка, переключаюсь на локальный каталог: {exc}")
        return self._local(genre_ids, limit)
