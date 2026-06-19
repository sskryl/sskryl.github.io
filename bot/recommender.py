"""Подбор фильмов: пул кандидатов для «Тиндера» и итоговые рекомендации.

Работает с «категориями» (ключами жанров):
- числовая строка ("28", "16", ...) — id жанра TMDB;
- "anime" — особая категория (анимация + японский язык оригинала).

Учитывает «память вкуса» (affinity по оценкам) и исключает уже оценённые фильмы.
С ключом TMDB_API_KEY берёт фильмы из TMDB, иначе — из локального каталога.
"""
from __future__ import annotations

import os
import random
from typing import Dict, List, Set

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


def _read_tmdb_key() -> str:
    """Ключ TMDB: из переменной окружения или из файла bot/tmdb.txt."""
    key = (os.getenv("TMDB_API_KEY") or "").strip()
    if key:
        return key
    path = os.path.join(os.path.dirname(__file__), "tmdb.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


class Recommender:
    def __init__(self) -> None:
        self.api_key = _read_tmdb_key()
        self.language = os.getenv("TMDB_LANGUAGE", "ru-RU")

    @property
    def uses_tmdb(self) -> bool:
        return bool(self.api_key)

    # --------------------------------------------------------------- TMDB
    def _discover(self, params: dict, page: int) -> List[dict]:
        p = {
            "api_key": self.api_key,
            "language": self.language,
            "sort_by": "popularity.desc",
            "vote_count.gte": 50,
            "page": page,
        }
        p.update(params)
        resp = requests.get(f"{TMDB_BASE}/discover/movie", params=p, timeout=15)
        resp.raise_for_status()
        return [_tmdb_movie(m) for m in resp.json().get("results", [])]

    def _popular(self, page: int) -> List[dict]:
        p = {"api_key": self.api_key, "language": self.language, "page": page}
        resp = requests.get(f"{TMDB_BASE}/movie/popular", params=p, timeout=15)
        resp.raise_for_status()
        return [_tmdb_movie(m) for m in resp.json().get("results", [])]

    @staticmethod
    def _category_specs(categories: List[str]) -> List[dict]:
        """Превращает выбранные категории в параметры discover-запросов."""
        numeric = [c for c in categories if str(c).isdigit()]
        specs: List[dict] = []
        if numeric:
            # OR по жанрам (через "|"), чтобы показывать фильмы любого из выбранных
            specs.append({"with_genres": "|".join(numeric)})
        if "anime" in categories:
            specs.append({"with_genres": "16", "with_original_language": "ja"})
        return specs

    # --------------------------------------------------------------- local
    def _local_all(self) -> List[dict]:
        movies = []
        for raw in catalog.load_catalog().get("movies", []):
            archive_id = raw.get("archiveId")
            movies.append(
                {
                    "key": raw["id"],
                    "source": "local",
                    "title": raw["title"],
                    "year": raw.get("year"),
                    "rating": raw.get("rating"),
                    "overview": raw.get("overview", ""),
                    "poster": (catalog.ARCHIVE_IMG + archive_id) if archive_id else None,
                    "url": (catalog.ARCHIVE_DETAILS + archive_id) if archive_id else None,
                    "genres": raw.get("genres", []),
                    "free": bool(archive_id),
                }
            )
        return movies

    # --------------------------------------------------------------- пул
    def candidate_pool(
        self,
        categories: List[str],
        exclude_keys: Set[str] | None = None,
        limit: int = 20,
        page: int = 1,
    ) -> List[dict]:
        exclude_keys = exclude_keys or set()
        categories = [str(c) for c in (categories or [])]

        if self.uses_tmdb:
            specs = self._category_specs(categories)
            batches: List[List[dict]] = []
            try:
                if specs:
                    for spec in specs:
                        batches.append(self._discover(spec, page))
                else:
                    batches.append(self._popular(page))
            except Exception as exc:  # noqa: BLE001
                print(f"[recommender] TMDB ошибка: {exc}")
                batches = []
            # Перемешиваем выдачу разных категорий по кругу
            collected, seen = [], set()
            while any(batches) and len(collected) < limit:
                for b in batches:
                    if b:
                        mv = b.pop(0)
                        if mv["key"] not in exclude_keys and mv["key"] not in seen:
                            seen.add(mv["key"])
                            collected.append(mv)
                            if len(collected) >= limit:
                                break
            if collected:
                return collected[:limit]

        # Локальный каталог (или fallback)
        if page > 1:
            return []
        wanted = {int(c) for c in categories if str(c).isdigit()}
        pool = [m for m in self._local_all() if m["key"] not in exclude_keys]
        if wanted:
            pool = [m for m in pool if wanted & set(m["genres"])]
            pool.sort(
                key=lambda m: (len(wanted & set(m["genres"])), m.get("rating") or 0),
                reverse=True,
            )
        elif categories:
            # выбраны только спец-категории (например, аниме) — локально их нет
            pool = []
        else:
            random.shuffle(pool)
        return pool[:limit]

    # --------------------------------------------------------------- новинки
    def recent_pool(
        self,
        exclude_keys: Set[str] | None = None,
        limit: int = 15,
        page: int = 1,
    ) -> List[dict]:
        """Современные фильмы и новинки (последние ~2 года)."""
        from datetime import date

        exclude_keys = exclude_keys or set()
        if self.uses_tmdb:
            start = f"{date.today().year - 2}-01-01"
            try:
                res = self._discover(
                    {
                        "primary_release_date.gte": start,
                        "primary_release_date.lte": date.today().isoformat(),
                        "with_release_type": "2|3",
                        "sort_by": "popularity.desc",
                        "vote_count.gte": 30,
                    },
                    page,
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[recommender] TMDB новинки: {exc}")
                res = []
            return [m for m in res if m["key"] not in exclude_keys][:limit]

        # Локально новинок нет — отдаём самое свежее из каталога (классика)
        if page > 1:
            return []
        pool = [m for m in self._local_all() if m["key"] not in exclude_keys]
        pool.sort(key=lambda m: (m.get("year") or 0), reverse=True)
        return pool[:limit]

    # --------------------------------------------------------------- рекомендации
    def recommend(
        self,
        categories: List[str],
        exclude_keys: Set[str] | None = None,
        affinity: Dict[int, int] | None = None,
        limit: int = 5,
    ) -> List[dict]:
        affinity = affinity or {}
        numeric = {int(c) for c in (categories or []) if str(c).isdigit()}
        pool = self.candidate_pool(categories, exclude_keys, limit=max(limit * 4, 20))

        def score(m: dict) -> float:
            aff = sum(affinity.get(g, 0) for g in m["genres"])
            overlap = len(numeric & set(m["genres"]))
            return aff * 2 + overlap + (m.get("rating") or 0) / 10.0

        pool.sort(key=score, reverse=True)
        return pool[:limit]


# -------------------------------------------------------------- вспомогательное
def effective_genres(
    quiz_scores: Dict[int, int],
    affinity: Dict[int, int],
    top_n: int = 4,
) -> List[int]:
    """Объединяет жанры психотеста и выученные предпочтения в топ-N жанров (числовые id)."""
    merged: Dict[int, float] = {}
    for g, v in (quiz_scores or {}).items():
        merged[g] = merged.get(g, 0) + v
    for g, v in (affinity or {}).items():
        merged[g] = merged.get(g, 0) + v * 1.5
    positive = [g for g, v in sorted(merged.items(), key=lambda kv: kv[1], reverse=True) if v > 0]
    if positive:
        return positive[:top_n]
    return [g for g, _ in sorted(merged.items(), key=lambda kv: kv[1], reverse=True)[:top_n]]
