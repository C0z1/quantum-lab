"""Modo subprocess del bridge de Qiskit.

Lee comandos de stdin (JSON, una linea por comando) y escribe resultados a
stdout (JSON, una linea por resultado). stderr para logs de depuracion.

El motor C++ (zmq_server) lanza este proceso y le pasa comandos VALIDATE_GROVER
tras cada ejecucion para comparar resultados (§3.2).
"""

from __future__ import annotations

import json
import sys

from algorithms.bernstein_vazirani import run_bernstein_vazirani
from algorithms.deutsch_jozsa import run_deutsch_jozsa
from algorithms.grover import run_grover
from algorithms.qft import run_qft
from algorithms.shor import run_shor
from algorithms.teleportation import run_teleportation


def _qiskit_version() -> str:
    try:
        import qiskit  # noqa: PLC0415

        return "Qiskit Aer " + qiskit.__version__
    except Exception:  # noqa: BLE001
        return "Qiskit"


def handle(cmd: dict) -> dict:
    ctype = cmd.get("type")
    ref = _qiskit_version()
    if ctype in ("VALIDATE_GROVER", "RUN_GROVER"):
        result = run_grover(
            int(cmd["n_qubits"]),
            int(cmd["target_state"]),
            int(cmd.get("iterations", 0)),
            int(cmd.get("shots", 1024)),
        )
        return {"status": "OK", "type": "GROVER_RESULT", "reference": ref, "result": result}
    if ctype in ("VALIDATE_TELEPORTATION", "RUN_TELEPORTATION"):
        result = run_teleportation(float(cmd.get("theta", 1.05)), float(cmd.get("phi", 0.785)))
        return {"status": "OK", "type": "TELEPORTATION_RESULT", "reference": ref, "result": result}
    if ctype in ("VALIDATE_SHOR", "RUN_SHOR"):
        result = run_shor(int(cmd["N"]), int(cmd["a"]))
        return {"status": "OK", "type": "SHOR_RESULT", "reference": ref, "result": result}
    if ctype in ("VALIDATE_DJ", "RUN_DJ"):
        result = run_deutsch_jozsa(int(cmd["n_qubits"]), bool(cmd.get("balanced", False)))
        return {"status": "OK", "type": "DJ_RESULT", "reference": ref, "result": result}
    if ctype in ("VALIDATE_BV", "RUN_BV"):
        result = run_bernstein_vazirani(int(cmd["n_qubits"]), int(cmd.get("hidden", 0)))
        return {"status": "OK", "type": "BV_RESULT", "reference": ref, "result": result}
    if ctype in ("VALIDATE_QFT", "RUN_QFT"):
        result = run_qft(int(cmd["n_qubits"]), int(cmd.get("period_exp", 0)))
        return {"status": "OK", "type": "QFT_RESULT", "reference": ref, "result": result}
    return {"status": "ERROR", "error": f"unknown command type: {ctype}"}


def main() -> None:
    print("[qiskit-bridge] subprocess ready", file=sys.stderr, flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            out = handle(cmd)
        except Exception as exc:  # noqa: BLE001
            out = {"status": "ERROR", "error": str(exc)}
        print(json.dumps(out), flush=True)


if __name__ == "__main__":
    main()
