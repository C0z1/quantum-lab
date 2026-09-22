"""Cliente ZeroMQ opcional: permite que el motor C++ pida validaciones a Qiskit.

No forma parte de la ruta critica (§2). Se ofrece para escenarios donde el
motor C++ actua como cliente REQ contra un servidor REP en Python.
"""

from __future__ import annotations

import json

import zmq

from algorithms.grover import run_grover


def serve(endpoint: str = "ipc:///tmp/quantum-lab-validate") -> None:
    """Servidor REP: recibe comandos JSON de validacion y responde resultados."""
    ctx = zmq.Context()
    rep = ctx.socket(zmq.REP)
    rep.bind(endpoint)
    print(f"[qiskit-bridge] validation server on {endpoint}", flush=True)
    try:
        while True:
            msg = rep.recv_string()
            try:
                cmd = json.loads(msg)
                if cmd.get("type") == "VALIDATE_GROVER":
                    result = run_grover(
                        cmd["n_qubits"], cmd["target_state"], cmd.get("iterations", 0)
                    )
                    rep.send_string(json.dumps({"status": "OK", "result": result}))
                else:
                    rep.send_string(json.dumps({"status": "ERROR", "error": "unknown type"}))
            except Exception as exc:  # noqa: BLE001
                rep.send_string(json.dumps({"status": "ERROR", "error": str(exc)}))
    finally:
        rep.close()
        ctx.term()


if __name__ == "__main__":
    serve()
