#!/usr/bin/env python3
"""Genera validation.json: divergencia real C++ vs Qiskit por algoritmo.

Arranca contra un motor C++ ya corriendo (QL_CMD_ENDPOINT / QL_STREAM_ENDPOINT)
y compara las probabilidades del frame final con las referencias de Qiskit.
Escribe un JSON con la máxima divergencia por algoritmo para el sello de la UI.
"""

import json
import os
import sys
import time
import datetime

import zmq
import msgpack

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "packages", "qiskit-bridge"))
from algorithms.grover import run_grover  # noqa: E402
from algorithms.teleportation import run_teleportation  # noqa: E402
from algorithms.shor import run_shor  # noqa: E402
from algorithms.deutsch_jozsa import run_deutsch_jozsa  # noqa: E402
from algorithms.bernstein_vazirani import run_bernstein_vazirani  # noqa: E402
from algorithms.qft import run_qft  # noqa: E402

CMD = os.environ.get("QL_CMD_ENDPOINT", "tcp://127.0.0.1:5770")
STREAM = os.environ.get("QL_STREAM_ENDPOINT", "tcp://127.0.0.1:5771")
TOL = 1e-9

ctx = zmq.Context()
sub = ctx.socket(zmq.SUB)
sub.connect(STREAM)
sub.setsockopt(zmq.SUBSCRIBE, b"statevec")
req = ctx.socket(zmq.REQ)
req.setsockopt(zmq.RCVTIMEO, 5000)
req.connect(CMD)
time.sleep(0.4)
poller = zmq.Poller()
poller.register(sub, zmq.POLLIN)


def run_cmd(cmd):
    req.send_string(json.dumps(cmd))
    ack = json.loads(req.recv_string())
    final = None
    deadline = time.time() + 6
    while time.time() < deadline:
        if dict(poller.poll(500)).get(sub) == zmq.POLLIN:
            sub.recv()
            _, _, _, is_final, data = msgpack.unpackb(sub.recv(), raw=False)
            if is_final:
                final = list(data[2::3])
                break
    return ack, final


def maxdp(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


algos = {}


def record(key, name, cases):
    # cases: lista de {"label": str, "delta": float}. Guardamos el detalle por
    # caso (para el panel de validación de la UI) y el máximo agregado (sello).
    d = max(c["delta"] for c in cases)
    algos[key] = {
        "name": name,
        "cases": len(cases),
        "maxDelta": d,
        "tolerance": TOL,
        "pass": d < TOL,
        "detail": cases,
    }
    print(f"{key}: maxΔ={d:.2e} ({len(cases)} casos) {'OK' if d < TOL else 'FAIL'}")


cs = []
for n, t, it in [(2, 3, 1), (3, 5, 2), (4, 7, 3)]:
    _, pc = run_cmd(
        {"type": "RUN_GROVER", "n_qubits": n, "target_state": t, "iterations": it, "stream_intermediate": True}
    )
    cs.append({"label": f"n={n}, objetivo={t}, iter={it}", "delta": maxdp(pc, run_grover(n, t, it)["probabilities"])})
record("grover", "Grover", cs)

cs = []
for theta, phi in [(1.05, 0.785), (2.3, -1.4), (0.6, 2.1)]:
    _, pc = run_cmd({"type": "RUN_TELEPORTATION", "theta": theta, "phi": phi})
    cs.append({"label": f"θ={theta}, φ={phi}", "delta": maxdp(pc, run_teleportation(theta, phi)["probabilities"])})
record("teleport", "Teletransportación", cs)

cs = []
for N, a in [(15, 7), (15, 2), (21, 2)]:
    _, pc = run_cmd({"type": "RUN_SHOR", "N": N, "a": a})
    cs.append({"label": f"N={N}, a={a}", "delta": maxdp(pc, run_shor(N, a)["counting_probabilities"])})
record("shor", "Shor", cs)

cs = []
for n in [1, 2, 3, 4, 5]:
    for bal in (False, True):
        _, pc = run_cmd({"type": "RUN_DJ", "n_qubits": n, "balanced": bal})
        cs.append({"label": f"n={n}, {'balanceada' if bal else 'constante'}", "delta": maxdp(pc, run_deutsch_jozsa(n, bal)["probabilities"])})
record("dj", "Deutsch-Jozsa", cs)

cs = []
for n in [1, 2, 3, 4]:
    for hidden in range(1 << n):
        _, pc = run_cmd({"type": "RUN_BV", "n_qubits": n, "hidden": hidden})
        cs.append({"label": f"n={n}, a={format(hidden, '0' + str(n) + 'b')}", "delta": maxdp(pc, run_bernstein_vazirani(n, hidden)["probabilities"])})
record("bv", "Bernstein-Vazirani", cs)

cs = []
for n, m in [(2, 1), (3, 1), (4, 2), (4, 3), (4, 0), (5, 2)]:
    _, pc = run_cmd({"type": "RUN_QFT", "n_qubits": n, "period_exp": m})
    cs.append({"label": f"n={n}, m={m}", "delta": maxdp(pc, run_qft(n, m)["probabilities"])})
record("qft", "QFT", cs)

overall = max(a["maxDelta"] for a in algos.values())
out = {
    "generatedAt": datetime.date.today().isoformat(),
    "reference": "Qiskit Aer " + __import__("qiskit").__version__,
    "tolerance": TOL,
    "overallMaxDelta": overall,
    "pass": all(a["pass"] for a in algos.values()),
    "algos": algos,
}
dest = os.path.join(
    ROOT, "packages", "electron-app", "src", "renderer", "validation.json"
)
with open(dest, "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print(f"\noverall maxΔ={overall:.2e} → {dest}")

try:
    req.send_string(json.dumps({"type": "SHUTDOWN"}))
    req.recv_string()
except Exception:
    pass
