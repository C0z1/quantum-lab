"""Tests de las referencias Qiskit para Deutsch-Jozsa, Bernstein-Vazirani y QFT.

Verifican la fisica esperada (§9) y sirven de contraparte a los tests C++
(test_basic_algos.cpp). La validacion cruzada elemento-a-elemento contra el
motor C++ vive en scripts/validate.py.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from algorithms.bernstein_vazirani import run_bernstein_vazirani  # noqa: E402
from algorithms.deutsch_jozsa import run_deutsch_jozsa  # noqa: E402
from algorithms.qft import run_qft  # noqa: E402


# ---------------- Deutsch-Jozsa ----------------
@pytest.mark.parametrize("n", [1, 2, 3, 4, 5])
def test_dj_constant_gives_all_zero(n):
    r = run_deutsch_jozsa(n, balanced=False)
    assert r["is_constant"] is True
    assert r["probabilities"][0] == pytest.approx(1.0, abs=1e-9)
    assert sum(r["probabilities"]) == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize("n", [1, 2, 3, 4, 5])
def test_dj_balanced_never_measures_zero(n):
    r = run_deutsch_jozsa(n, balanced=True)
    assert r["is_constant"] is False
    assert r["probabilities"][0] == pytest.approx(0.0, abs=1e-9)
    assert sum(r["probabilities"]) == pytest.approx(1.0, abs=1e-9)


# ---------------- Bernstein-Vazirani ----------------
@pytest.mark.parametrize("n", [1, 2, 3, 4, 5])
def test_bv_recovers_hidden_string(n):
    for a in range(1 << n):
        r = run_bernstein_vazirani(n, a)
        assert r["recovered"] == a
        assert r["probabilities"][a] == pytest.approx(1.0, abs=1e-9)


def test_bv_rejects_out_of_range():
    with pytest.raises(ValueError):
        run_bernstein_vazirani(3, 8)


# ---------------- QFT ----------------
def test_qft_comb_gives_evenly_spaced_peaks():
    # n=4, m=2: 2^m = 4 picos espaciados 2^(n-m) = 4.
    r = run_qft(4, 2)
    assert r["peaks"] == [0, 4, 8, 12]
    for i, p in enumerate(r["probabilities"]):
        assert p == pytest.approx(0.25 if i % 4 == 0 else 0.0, abs=1e-9)
    assert sum(r["probabilities"]) == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize(
    "n,m,expected",
    [
        (4, 3, [0, 2, 4, 6, 8, 10, 12, 14]),
        (3, 1, [0, 4]),
        (4, 0, [0]),  # sin peine -> delta en 0
    ],
)
def test_qft_peak_positions(n, m, expected):
    assert run_qft(n, m)["peaks"] == expected


def test_qft_m0_is_delta():
    r = run_qft(4, 0)
    assert r["probabilities"][0] == pytest.approx(1.0, abs=1e-9)
