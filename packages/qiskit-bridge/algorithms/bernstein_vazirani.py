"""Bernstein-Vazirani de referencia con Qiskit.

Recupera la cadena oculta a (f(x) = a.x mod 2) con UNA consulta. Mismo circuito
que el motor C++ (basic_algos.cpp): ancilla en |->, oraculo = CNOT(entrada i ->
ancilla) alla donde el bit i de a vale 1. El marginal del registro de entrada se
devuelve con la convencion little-endian del motor (qubit 0 = LSB).
"""

from __future__ import annotations

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector


def build_circuit(n: int, hidden: int) -> QuantumCircuit:
    qc = QuantumCircuit(n + 1)
    qc.x(n)  # ancilla a |->
    qc.h(n)
    for i in range(n):
        qc.h(i)
    for i in range(n):  # oraculo a.x
        if (hidden >> i) & 1:
            qc.cx(i, n)
    for i in range(n):
        qc.h(i)
    return qc


def run_bernstein_vazirani(n: int, hidden: int) -> dict:
    """Ejecuta BV y devuelve el marginal del registro de entrada.

    Retorna:
        {
            "probabilities": [float, ...],  # 2^n valores
            "recovered": int,               # argmax = cadena oculta
            "n_qubits": int
        }
    """
    if n < 1:
        raise ValueError("n >= 1")
    if hidden >= (1 << n):
        raise ValueError("hidden < 2^n")
    qc = build_circuit(n, hidden)
    sv = Statevector(qc)  # orden logico nativo (qubit 0 = LSB)

    inputs = list(range(n))  # qubit 0 = LSB (qargs[0] menos significativo)
    probs = [float(p) for p in sv.probabilities(inputs)]
    return {
        "probabilities": probs,
        "recovered": int(max(range(len(probs)), key=lambda i: probs[i])),
        "n_qubits": n,
    }
