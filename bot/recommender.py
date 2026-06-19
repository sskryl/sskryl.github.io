"""Подбор фильмов: пул кандидатов для «Тиндера» и итоговые рекомендации.

Учитывает результат психотеста (жанры) и «память вкуса» (affinity по оценкам),
исключает уже оценённые фильмы.

С ключом TMDB_API_KEY берёт фильмы из базы TMDB, иначе — из локального
каталога public-domain фильмов (catalog.py).
"""
from __future__ import annotations

import os
import random
from typing import Dict, Iterable, List, Set

import requests

import catalog

TMDB_BASE = "https://api.themoviedb.org/3"
IMG_POSTER = "https://image.tmdb.org/t/p/w500"
TMDB_DETAILS = "https://www.themoviedb.org/movie/"


def _tmdb_movie(m: dict) -> dict:
    return {
        "key": "tmdb:" + str(m["id"]),
        "source": "tmdb",
        "title": m.get("title") or m.get("original_title", ""),
        "year": (m.get("release_date") or "")[:4],
        "rating": round(m["vote_average"], 1) if m.get("vote_average") else None,
        "overview": m.get("overview", ""),
        "poster": IMG_POSTER + m["poster_path"] if m.get("poster_path") else None,
        "url": TMDB_DETAILS + str(m["id"]),
        "genres": m.get("genre_ids") or [g["id"] for g in m.get("genres", [])],
        "free": False,
    }


class Recommender:
    def __init__(self) -> None:
        self.api_key = (os.getenv("TMDB_API_KEY") or "").strip()
        self.language = os.getenv("TMDB_LANGUAGE", "ru-RU")

    @property
    def uses_tmdb(self) -> bool:
        return bool(self.api_key)

    # --------------------------------------------------------------- источники
    def _tmdb_fetch(self, genre_ids: Iterable[int], page: int) -> List[dict]:
        genre_ids = list(genre_ids or [])
        if not genre_ids:
            # психотест ещё не пройден — берём популярное
            params = {"api_key": self.api_key, "language": self.language, "page": page}
            resp = requests.get(f"{TMDB_BASE}/movie/popular", params=params, timeout=15)
        else:
            params = {
                "api_key": self.api_key,
                "language": self.language,
                "with_genres": ",".join(str(g) for g in genre_ids),
                "sort_by": "popularity.desc",
                "vote_count.gte": 80,
                "page": page,
            }
            resp = requests.get(f"{TMDB_BASE}/discover/movie", params=params, timeout=15)
        resp.raise_for_status()
        return [_tmdb_movie(m) for m in resp.json().get("results", [])]

    def _local_all(self) -> List[dict]:
        movies = []
        for m in catalog.local_movies():
            mm = dict(m)
            mm["key"] = m["title"]  # запасной ключ, заменим ниже на id из каталога
            movies.append(mm)
        # У локального каталога ключ — это id фильма из catalog.json
        raw = {x["title"]: x for x in catalog.load_catalog().get("movies", [])}
        for mm in movies:
            src = raw.get(mm["title"])
            if src:
                mm["key"] = src["id"]
        return movies

    # --------------------------------------------------------------- пул
    def candidate_pool(
        self,
        genre_ids: List[int],
        exclude_keys: Set[str] | None = None,
        limit: int = 20,
        page: int = 1,
    ) -> List[dict]:
        """Кандидаты для свайпа: по жанрам, без уже оценённых."""
        exclude_keys = exclude_keys or set()
        if self.uses_tmdb:
            collected: List[dict] = []
            p = page
            # добираем несколько страниц, пока не наберём limit
            while len(collected) < limit and p <= page + 4:
                try:
                    batch = self._tmdb_fetch(genre_ids, p)
                except Exception as exc:  # noqa: BLE001
                    print(f"[recommender] TMDB ошибка: {exc}")
                    break
                if not batch:
                    break
                for mv in batch:
                    if mv["key"] not in exclude_keys:
                        collected.append(mv)
                p += 1
            if collected:
                return collected[:limit]

        # Локальный каталог (или fallback)
        if page > 1:
            return []
        wanted = set(genre_ids)
        pool = [m for m in self._local_all() if m["key"] not in exclude_keys]
        if wanted:
            pool.sort(
                key=lambda m: (len(wanted & set(m["genres"])), m.get("rating") or 0),
                reverse=True,
            )
        else:
            random.shuffle(pool)
        return pool[:limit]

    # --------------------------------------------------------------- рекомендации
    def recommend(
        self,
        genre_ids: List[int],
        exclude_keys: Set[str] | None = None,
        affinity: Dict[int, int] | None = None,
        limit: int = 5,
    ) -> List[dict]:
        """Итоговая подборка: ранжируем кандидатов по совпадению с любимыми жанрами."""
        affinity = affinity or {}
        pool = self.candidate_pool(genre_ids, exclude_keys, limit=max(limit * 4, 20))

        def score(m: dict) -> float:
            aff = sum(affinity.get(g, 0) for g in m["genres"])
            overlap = len(set(genre_ids) & set(m["genres"]))
            return aff * 2 + overlap + (m.get("rating") or 0) / 10.0

        pool.sort(key=score, reverse=True)
        return pool[:limit]


# -------------------------------------------------------------- вспомогательное
def effective_genres(
    quiz_scores: Dict[int, int],
    affinity: Dict[int, int],
    top_n: int = 4,
) -> List[int]:
    """Объединяет жанры психотеста и выученные предпочтения в топ-N жанров."""
    merged: Dict[int, float] = {}
    for g, v in (quiz_scores or {}).items():
        merged[g] = merged.get(g, 0) + v
    for g, v in (affinity or {}).items():
        merged[g] = merged.get(g, 0) + v * 1.5
    # жанры с положительным итогом, по убыванию
    ranked = [g for g, v in sorted(merged.items(), key=lambda kv: kv[1], reverse=True) if v > 0]
    return ranked[:top_n] if ranked else [g for g, _ in sorted(merged.items(), key=lambda kv: kv[1], reverse=True)[:top_n]]
