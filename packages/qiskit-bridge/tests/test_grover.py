"""Tests del circuito de Grover de Qiskit (golden values §9)."""

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from algorithms.grover import optimal_iterations, run_grover  # noqa: E402


def _closed_form(n: int, k: int) -> float:
    theta = math.asin(1.0 / math.sqrt(2**n))
    return math.sin((2 * k + 1) * theta) ** 2


def test_norm_is_one():
    res = run_grover(3, 5, 2)
    assert abs(sum(res["probabilities"]) - 1.0) < 1e-9


def test_n2_exact():
    res = run_grover(2, 3, 1)
    assert res["probabilities"][3] == pytest.approx(1.0, abs=1e-6)


def test_n3_target5_two_iters():
    res = run_grover(3, 5, 2)
    p = res["probabilities"][5]
    assert p > 0.7
    assert p == pytest.approx(0.945, abs=1e-3)
    assert p == pytest.approx(_closed_form(3, 2), abs=1e-6)


def test_n4_target7_three_iters():
    res = run_grover(4, 7, 3)
    p = res["probabilities"][7]
    assert p == pytest.approx(0.961, abs=1e-3)
    assert p == pytest.approx(_closed_form(4, 3), abs=1e-6)


def test_optimal_iterations():
    assert optimal_iterations(10) == 25


def test_target_is_most_probable():
    n, target = 5, 21
    res = run_grover(n, target, optimal_iterations(n))
    probs = res["probabilities"]
    assert max(range(len(probs)), key=lambda i: probs[i]) == target
