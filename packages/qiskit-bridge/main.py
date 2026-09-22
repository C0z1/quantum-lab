"""Modo subprocess del bridge de Qiskit.

Lee comandos de stdin (JSON, una linea por comando) y escribe resultados a
stdout (JSON, una linea por resultado). stderr para logs de depuracion.

El motor C++ (zmq_server) lanza este proceso y le pasa comandos VALIDATE_GROVER
tras cada ejecucion para comparar resultados (§3.2).
"""

from __future__ import annotations

import json
import sys

from algorithms.grover import run_grover
from algorithms.shor import run_shor
from algorithms.teleportation import run_teleportation


def handle(cmd: dict) -> dict:
    ctype = cmd.get("type")
    if ctype in ("VALIDATE_GROVER", "RUN_GROVER"):
        result = run_grover(
            int(cmd["n_qubits"]),
            int(cmd["target_state"]),
            int(cmd.get("iterations", 0)),
            int(cmd.get("shots", 1024)),
        )
        return {"status": "OK", "type": "GROVER_RESULT", "result": result}
    if ctype in ("VALIDATE_TELEPORTATION", "RUN_TELEPORTATION"):
        result = run_teleportation(float(cmd.get("theta", 1.05)), float(cmd.get("phi", 0.785)))
        return {"status": "OK", "type": "TELEPORTATION_RESULT", "result": result}
    if ctype in ("VALIDATE_SHOR", "RUN_SHOR"):
        result = run_shor(int(cmd["N"]), int(cmd["a"]))
        return {"status": "OK", "type": "SHOR_RESULT", "result": result}
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
