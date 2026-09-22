"""Deutsch-Jozsa de referencia con Qiskit.

Decide con UNA consulta si una funcion booleana es constante o balanceada.
Mismo circuito que el motor C++ (basic_algos.cpp): n entradas + 1 ancilla en
|->, phase kickback via CNOT para el oraculo balanceado (paridad), identidad
para el constante (f = 0). El marginal del registro de entrada se devuelve con
la MISMA convencion little-endian que el motor (qubit 0 = LSB) para comparacion
elemento a elemento.
"""

from __future__ import annotations

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector


def build_circuit(n: int, balanced: bool) -> QuantumCircuit:
    qc = QuantumCircuit(n + 1)  # entradas 0..n-1, ancilla n
    qc.x(n)  # ancilla a |->
    qc.h(n)
    for i in range(n):
        qc.h(i)
    if balanced:  # oraculo paridad: CNOT de cada entrada a la ancilla
        for i in range(n):
            qc.cx(i, n)
    # constante f=0 -> sin puertas
    for i in range(n):
        qc.h(i)
    return qc


def run_deutsch_jozsa(n: int, balanced: bool) -> dict:
    """Ejecuta DJ y devuelve el marginal del registro de entrada.

    Retorna:
        {
            "probabilities": [float, ...],  # 2^n valores (marginal de entradas)
            "is_constant": bool,
            "n_qubits": int
        }
    """
    if n < 1:
        raise ValueError("n >= 1")
    qc = build_circuit(n, balanced)
    sv = Statevector(qc)  # orden logico nativo (qubit 0 = LSB)

    # Convencion del motor: qubit 0 = LSB. Statevector.probabilities toma
    # qargs[0] como bit menos significativo, luego inputs = [0, 1, ..., n-1].
    inputs = list(range(n))
    probs = [float(p) for p in sv.probabilities(inputs)]
    return {
        "probabilities": probs,
        "is_constant": probs[0] > 0.5,  # constante <=> toda la prob en |0...0>
        "n_qubits": n,
    }
