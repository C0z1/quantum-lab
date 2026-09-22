"""Shor de referencia con Qiskit: QPE de order-finding.

La multiplicacion modular se aporta como UnitaryGate (validacion independiente
del motor C++). La QFT inversa se implementa a mano con la MISMA convencion que
el motor C++ para permitir comparacion elemento a elemento del registro de
conteo. Layout: work [0, nw), counting [nw, nw+t).
"""

from __future__ import annotations

import math

import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit.circuit.library import UnitaryGate
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator


def _gcd(x: int, y: int) -> int:
    while y:
        x, y = y, x % y
    return x


def counting_qubits(N: int) -> int:
    n = math.ceil(math.log2(N))
    return 2 * n


def classical_order(a: int, N: int) -> int:
    if _gcd(a, N) != 1:
        return 0
    r, cur = 1, a % N
    while cur != 1:
        cur = (cur * a) % N
        r += 1
        if r > N:
            return 0
    return r


def _modmul_unitary(mult: int, N: int, nw: int) -> np.ndarray:
    """Matriz de permutacion de |y> -> |mult*y mod N> (identidad si y>=N)."""
    dim = 1 << nw
    P = np.zeros((dim, dim), dtype=complex)
    for y in range(dim):
        y2 = (mult * y) % N if y < N else y
        P[y2, y] = 1.0
    return P


def _inverse_qft(qc: QuantumCircuit, start: int, t: int) -> None:
    """QFT inversa con la misma convencion que el motor C++ (qubit start = LSB)."""
    for i in range(t // 2):
        qc.swap(start + i, start + t - 1 - i)
    for j in range(t):
        for k in range(j):
            qc.cp(-math.pi / (2 ** (j - k)), start + k, start + j)
        qc.h(start + j)


def build_circuit(N: int, a: int) -> tuple[QuantumCircuit, int, int]:
    nw = math.ceil(math.log2(N))
    t = counting_qubits(N)
    qc = QuantumCircuit(nw + t)
    work = list(range(nw))
    count_start = nw

    qc.x(work[0])  # registro de trabajo = |1>
    for j in range(t):
        qc.h(count_start + j)  # superposicion en el conteo

    for j in range(t):
        mult = pow(a, 1 << j, N)
        gate = UnitaryGate(_modmul_unitary(mult, N, nw), label=f"*{mult}%{N}").control(1)
        qc.append(gate, [count_start + j] + work)

    _inverse_qft(qc, count_start, t)
    return qc, nw, t


def run_shor(N: int, a: int) -> dict:
    """Ejecuta la QPE de Shor y devuelve la distribucion del registro de conteo.

    Retorna:
        {
            "counting_probabilities": [float, ...],  # 2^t valores
            "counting_qubits": int,
            "work_qubits": int,
            "order": int,          # periodo clasico (referencia)
            "factors": [int, ...]  # factores clasicos (referencia)
        }
    """
    if _gcd(a, N) != 1:
        g = _gcd(a, N)
        return {
            "counting_probabilities": [],
            "counting_qubits": 0,
            "work_qubits": 0,
            "order": 0,
            "factors": sorted({g, N // g}),
        }

    qc, nw, t = build_circuit(N, a)
    sim = AerSimulator(method="statevector")
    qc.save_statevector()
    sv = Statevector(sim.run(transpile(qc, sim)).result().get_statevector().data)

    # Statevector.probabilities(qargs) toma qargs[0] como bit mas significativo;
    # el motor C++ usa el primer qubit de conteo como bit menos significativo, asi
    # que invertimos el orden para que el marginal coincida elemento a elemento.
    counting = list(range(nw + t - 1, nw - 1, -1))
    probs = sv.probabilities(counting)  # marginal del registro de conteo

    r = classical_order(a, N)
    factors: list[int] = []
    if r and r % 2 == 0:
        x = pow(a, r // 2, N)
        if x != N - 1:
            for f in (_gcd(x + 1, N), _gcd(x - 1, N)):
                if f not in (1, N):
                    factors.append(f)
    return {
        "counting_probabilities": [float(p) for p in probs],
        "counting_qubits": t,
        "work_qubits": nw,
        "order": r,
        "factors": sorted(set(factors)),
    }
