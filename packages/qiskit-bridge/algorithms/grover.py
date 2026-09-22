"""Circuito de Grover de referencia con Qiskit + Aer.

Sirve como validacion independiente del motor C++. La convencion de indexado
es little-endian (qubit 0 = bit menos significativo), identica a la del motor
C++, de modo que el indice de amplitud i corresponde al mismo estado base.
"""

from __future__ import annotations

import math

import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator


def optimal_iterations(n_qubits: int) -> int:
    """Numero optimo de iteraciones ~ floor(pi/4 * sqrt(N))."""
    n_states = 2**n_qubits
    return max(1, int(math.floor(math.pi / 4.0 * math.sqrt(n_states))))


def _oracle(qc: QuantumCircuit, n_qubits: int, target_state: int) -> None:
    """Marca el estado objetivo con una fase -1 (Z multi-controlada)."""
    # Colocar X en los qubits cuyo bit en target es 0.
    for q in range(n_qubits):
        if not (target_state >> q) & 1:
            qc.x(q)
    _mcz(qc, n_qubits)
    for q in range(n_qubits):
        if not (target_state >> q) & 1:
            qc.x(q)


def _mcz(qc: QuantumCircuit, n_qubits: int) -> None:
    """Z multi-controlada sobre |11...1>."""
    if n_qubits == 1:
        qc.z(0)
        return
    ctrl = list(range(n_qubits - 1))
    tgt = n_qubits - 1
    qc.h(tgt)
    qc.mcx(ctrl, tgt)
    qc.h(tgt)


def _diffuser(qc: QuantumCircuit, n_qubits: int) -> None:
    """Difusor de Grover: reflexion sobre la superposicion uniforme."""
    qc.h(range(n_qubits))
    qc.x(range(n_qubits))
    _mcz(qc, n_qubits)
    qc.x(range(n_qubits))
    qc.h(range(n_qubits))


def build_circuit(n_qubits: int, target_state: int, iterations: int) -> QuantumCircuit:
    """Construye el circuito de Grover (sin medicion)."""
    qc = QuantumCircuit(n_qubits)
    qc.h(range(n_qubits))  # superposicion uniforme
    for _ in range(iterations):
        _oracle(qc, n_qubits, target_state)
        _diffuser(qc, n_qubits)
    return qc


def run_grover(n_qubits: int, target_state: int, iterations: int, shots: int = 1024) -> dict:
    """Ejecuta Grover y devuelve statevector, probabilidades y counts.

    Retorna:
        {
            "statevector": [[re, im], ...],
            "probabilities": [float, ...],
            "counts": {"101": 512, ...},
            "iterations": int
        }
    """
    if n_qubits < 1 or n_qubits > 20:
        raise ValueError("n_qubits must be in [1, 20]")
    if not (0 <= target_state < 2**n_qubits):
        raise ValueError("target_state out of range")
    if iterations <= 0:
        iterations = optimal_iterations(n_qubits)

    sim = AerSimulator(method="statevector")

    # --- Statevector exacto ---
    qc_sv = build_circuit(n_qubits, target_state, iterations)
    qc_sv.save_statevector()
    tqc = transpile(qc_sv, sim)
    sv = np.asarray(sim.run(tqc).result().get_statevector().data)

    statevector = [[float(a.real), float(a.imag)] for a in sv]
    probabilities = [float(abs(a) ** 2) for a in sv]

    # --- Muestreo (counts) ---
    qc_meas = build_circuit(n_qubits, target_state, iterations)
    qc_meas.measure_all()
    tqc_m = transpile(qc_meas, sim)
    counts = sim.run(tqc_m, shots=shots).result().get_counts()

    return {
        "statevector": statevector,
        "probabilities": probabilities,
        "counts": {str(k): int(v) for k, v in counts.items()},
        "iterations": iterations,
    }
