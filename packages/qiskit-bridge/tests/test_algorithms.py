"""Tests de las referencias Qiskit de teleportacion y Shor."""

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from algorithms.shor import classical_order, run_shor  # noqa: E402
from algorithms.teleportation import run_teleportation  # noqa: E402


@pytest.mark.parametrize(
    "theta,phi",
    [
        (0.0, 0.0),
        (1.5707, 0.0),
        (1.1, 0.7),
        (2.3, -1.4),
    ],
)
def test_teleportation_fidelity_one(theta, phi):
    res = run_teleportation(theta, phi)
    assert res["fidelity"] == pytest.approx(1.0, abs=1e-9)


def test_teleportation_norm():
    res = run_teleportation(1.1, 0.7)
    assert sum(res["probabilities"]) == pytest.approx(1.0, abs=1e-9)


def test_shor_factor15():
    res = run_shor(15, 7)
    assert res["order"] == 4
    assert set(res["factors"]) == {3, 5}
    assert abs(sum(res["counting_probabilities"]) - 1.0) < 1e-9


def test_shor_factor21():
    res = run_shor(21, 2)
    assert res["order"] == 6
    assert 3 in res["factors"] or 7 in res["factors"]


def test_classical_order():
    assert classical_order(7, 15) == 4
    assert classical_order(2, 21) == 6
