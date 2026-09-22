"""Teletransportacion cuantica de referencia con Qiskit (medicion diferida).

Mismo circuito unitario que el motor C++: las correcciones X/Z se implementan
como CNOT/CZ controladas, de modo que el qubit destino (2) recupera |psi>.
Convencion little-endian (qubit 0 = LSB), identica al motor C++.
"""

from __future__ import annotations

import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator


def build_circuit(theta: float, phi: float) -> QuantumCircuit:
    qc = QuantumCircuit(3)
    # Paso 0: preparar |psi> = cos(t/2)|0> + e^{i phi} sin(t/2)|1> en el qubit 0.
    qc.ry(theta, 0)
    qc.rz(phi, 0)
    # Paso 1: par de Bell entre 1 y 2.
    qc.h(1)
    qc.cx(1, 2)
    # Paso 2: Alice enreda y mide en base de Bell.
    qc.cx(0, 1)
    qc.h(0)
    # Paso 3: correcciones diferidas.
    qc.cx(1, 2)
    qc.cz(0, 2)
    return qc


def _bloch_of_qubit(sv: np.ndarray, qubit: int, n: int) -> np.ndarray:
    """Vector de Bloch del qubit trazando el resto (little-endian)."""
    stride = 1 << qubit
    r00 = r11 = 0.0 + 0j
    r01 = 0.0 + 0j
    for i in range(len(sv)):
        if i & stride:
            continue
        a = sv[i]
        b = sv[i | stride]
        r00 += a * np.conj(a)
        r11 += b * np.conj(b)
        r01 += a * np.conj(b)
    return np.array([2 * r01.real, -2 * r01.imag, (r00 - r11).real])


def run_teleportation(theta: float, phi: float) -> dict:
    """Ejecuta la teleportacion y devuelve statevector, probabilidades y Bloch.

    Retorna:
        {
            "statevector": [[re, im], ...],
            "probabilities": [float, ...],
            "dest_bloch": [x, y, z],
            "source_bloch": [x, y, z],
            "fidelity": float
        }
    """
    sim = AerSimulator(method="statevector")
    qc = build_circuit(theta, phi)
    qc.save_statevector()
    sv = np.asarray(sim.run(transpile(qc, sim)).result().get_statevector().data)

    source = np.array([np.sin(theta) * np.cos(phi), np.sin(theta) * np.sin(phi), np.cos(theta)])
    dest = _bloch_of_qubit(sv, 2, 3)
    fidelity = 0.5 * (1.0 + float(np.dot(source, dest)))
    return {
        "statevector": [[float(a.real), float(a.imag)] for a in sv],
        "probabilities": [float(abs(a) ** 2) for a in sv],
        "dest_bloch": [float(x) for x in dest],
        "source_bloch": [float(x) for x in source],
        "fidelity": fidelity,
    }
