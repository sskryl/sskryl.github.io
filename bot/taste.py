"""Модель вкуса с онлайн-обучением.

Лёгкая логистическая регрессия (SGD): после КАЖДОГО ответа пользователя
(лайк/дизлайк) веса обновляются, поэтому подбор становится точнее прямо
в процессе. Признаки фильма: жанры, эпоха (десятилетие) и «новизна».

Веса хранятся в профиле пользователя (storage.taste_weights) — модель
персональная и сохраняется между запусками.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Dict

CURRENT_YEAR = datetime.now().year
LR = 0.35       # скорость обучения
L2 = 0.002      # лёгкая регуляризация, чтобы веса не разрастались


def _era_feature(year) -> str | None:
    try:
        y = int(year)
    except (TypeError, ValueError):
        return None
    if y < 1970:
        return "era:classic"
    return f"era:{(y // 10) * 10}s"


def features(movie: dict) -> Dict[str, float]:
    """Превращает фильм в набор признаков."""
    f: Dict[str, float] = {"bias": 1.0}
    for g in movie.get("genres", []) or []:
        f[f"g:{g}"] = 1.0
    era = _era_feature(movie.get("year"))
    if era:
        f[era] = 1.0
    try:
        if int(movie.get("year") or 0) >= CURRENT_YEAR - 2:
            f["recent"] = 1.0
    except (TypeError, ValueError):
        pass
    return f


def _dot(weights: Dict[str, float], f: Dict[str, float]) -> float:
    return sum(weights.get(k, 0.0) * v for k, v in f.items())


def score(weights: Dict[str, float], movie: dict) -> float:
    """Оценка «зайдёт/не зайдёт» (логит). Чем больше — тем вероятнее понравится."""
    return _dot(weights or {}, features(movie))


def predict(weights: Dict[str, float], movie: dict) -> float:
    """Вероятность лайка (0..1)."""
    z = max(-20.0, min(20.0, score(weights, movie)))
    return 1.0 / (1.0 + math.exp(-z))


def update(weights: Dict[str, float], movie: dict, liked: bool) -> Dict[str, float]:
    """Один шаг онлайн-обучения после ответа пользователя."""
    weights = dict(weights or {})
    f = features(movie)
    error = (1.0 if liked else 0.0) - predict(weights, movie)
    for k, v in f.items():
        weights[k] = weights.get(k, 0.0) * (1.0 - L2) + LR * error * v
    return weights


def warm_start(weights: Dict[str, float], quiz_scores: Dict[int, int]) -> Dict[str, float]:
    """Стартовая инициализация из психотеста: жанровые баллы → начальные веса."""
    weights = dict(weights or {})
    mx = max(quiz_scores.values()) if quiz_scores else 0
    if mx:
        for g, s in quiz_scores.items():
            weights[f"g:{g}"] = weights.get(f"g:{g}", 0.0) + s / mx
    return weights


def top_signals(weights: Dict[str, float], n: int = 3) -> list:
    """Самые сильные положительные признаки (для объяснимости/отладки)."""
    items = [(k, v) for k, v in (weights or {}).items() if k != "bias" and v > 0]
    items.sort(key=lambda kv: kv[1], reverse=True)
    return items[:n]
