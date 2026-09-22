"""Serializacion NumPy -> MessagePack para frames del vector de estado.

Layout identico al motor C++ (§2): [re0, im0, prob0, re1, im1, prob1, ...].
"""

from __future__ import annotations

import msgpack
import numpy as np


def statevector_to_frame_bytes(
    sv: np.ndarray, iteration: int, n_qubits: int, is_final: bool
) -> bytes:
    """Empaqueta un statevector NumPy complejo como frame MessagePack."""
    sv = np.asarray(sv, dtype=np.complex128)
    re = sv.real
    im = sv.imag
    prob = re * re + im * im
    # Intercalar [re, im, prob, ...] sin bucles Python.
    data = np.empty(sv.size * 3, dtype=np.float64)
    data[0::3] = re
    data[1::3] = im
    data[2::3] = prob
    frame = {
        "iteration": int(iteration),
        "n_qubits": int(n_qubits),
        "state_size": int(sv.size),
        "is_final": bool(is_final),
        "data": data.tolist(),
    }
    return msgpack.packb(frame, use_bin_type=True)


def frame_bytes_to_dict(raw: bytes) -> dict:
    """Desempaqueta un frame MessagePack a dict (para tests/depuracion)."""
    return msgpack.unpackb(raw, raw=False)
