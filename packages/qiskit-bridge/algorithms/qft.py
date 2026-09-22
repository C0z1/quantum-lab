"""QFT de referencia con Qiskit.

Demuestra la Transformada de Fourier Cuantica: un "peine" uniforme (periodo 2^m
en posicion) se transforma en picos espaciados 2^(n-m). La QFT directa se
implementa a mano con la MISMA convencion que el motor C++ (basic_algos.cpp:
qftForward), inversa exacta de la QFT^-1 usada en Shor, para comparacion
elemento a elemento del registro.
"""

from __future__ import annotations

import math

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector


def qft_forward(qc: QuantumCircuit, start: int, t: int) -> None:
    """QFT directa (convencion little-endian: qubit start = LSB)."""
    for j in range(t - 1, -1, -1):
        qc.h(start + j)
        for k in range(j - 1, -1, -1):
            qc.cp(math.pi / (2 ** (j - k)), start + k, start + j)
    for i in range(t // 2):
        qc.swap(start + i, start + t - 1 - i)


def build_circuit(n: int, period_exp: int) -> QuantumCircuit:
    m = max(0, min(period_exp, n))
    qc = QuantumCircuit(n)
    for q in range(m, n):  # peine: uniforme sobre bits altos
        qc.h(q)
    qft_forward(qc, 0, n)
    return qc


def run_qft(n: int, period_exp: int) -> dict:
    """Ejecuta la demo de QFT y devuelve la distribucion del registro.

    Retorna:
        {
            "probabilities": [float, ...],  # 2^n valores
            "peaks": [int, ...],            # indices con prob significativa
            "n_qubits": int,
            "period_exp": int
        }
    """
    if n < 1:
        raise ValueError("n >= 1")
    qc = build_circuit(n, period_exp)
    # Statevector(qc) evalua el circuito logico en orden nativo (qubit 0 = LSB);
    # NO usar transpile+save_statevector, que captura el orden fisico reordenado
    # por el ruteo de los SWAP y bit-invierte la lectura del registro.
    sv = Statevector(qc)

    order = list(range(n))  # qubit 0 = LSB (qargs[0] menos significativo)
    probs = [float(p) for p in sv.probabilities(order)]
    peaks = [i for i, p in enumerate(probs) if p > 1e-6]
    return {
        "probabilities": probs,
        "peaks": peaks,
        "n_qubits": n,
        "period_exp": max(0, min(period_exp, n)),
    }
