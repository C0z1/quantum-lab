#!/usr/bin/env python3
"""Validacion cruzada C++ (ZMQ) vs Qiskit — §3.2 / §9.

Compara Grover, Teletransportacion y Shor entre el motor C++ y las referencias
de Qiskit. Falla si alguna divergencia de probabilidades supera 1e-9.

Uso:
    packages/core-engine/build/quantum-engine   # terminal 1
    python3 scripts/validate.py                 # terminal 2
"""

import json
import os
import sys
import time

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
time.sleep(0.3)
poller = zmq.Poller()
poller.register(sub, zmq.POLLIN)


def run_cmd(cmd: dict):
    """Envia un comando y devuelve (ack, probs_del_frame_final)."""
    req.send_string(json.dumps(cmd))
    ack = json.loads(req.recv_string())
    final_probs = None
    deadline = time.time() + 6
    while time.time() < deadline:
        if dict(poller.poll(500)).get(sub) == zmq.POLLIN:
            sub.recv()
            _, _, _, is_final, data = msgpack.unpackb(sub.recv(), raw=False)
            if is_final:
                final_probs = list(data[2::3])
                break
    return ack, final_probs


def max_dp(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


results = []

print("== GROVER ==")
for n, target, iters in [(2, 3, 1), (3, 5, 2), (4, 7, 3)]:
    ack, pc = run_cmd(
        {
            "type": "RUN_GROVER",
            "n_qubits": n,
            "target_state": target,
            "iterations": iters,
            "stream_intermediate": True,
        }
    )
    pq = run_grover(n, target, iters)["probabilities"]
    d = max_dp(pc, pq)
    results.append(d < TOL)
    print(
        f"  n={n} t={target} it={iters}: max|dp|={d:.2e} {'OK' if d < TOL else 'FAIL'}"
    )

print("== TELEPORTATION ==")
for theta, phi in [(1.05, 0.785), (2.3, -1.4), (0.6, 2.1)]:
    ack, pc = run_cmd({"type": "RUN_TELEPORTATION", "theta": theta, "phi": phi})
    ref = run_teleportation(theta, phi)
    pq = ref["probabilities"]
    d = max_dp(pc, pq)
    results.append(d < TOL)
    print(
        f"  theta={theta} phi={phi}: fidelity(C++ ack)={ack.get('fidelity'):.9f} "
        f"max|dp|={d:.2e} {'OK' if d < TOL else 'FAIL'}"
    )

print("== SHOR ==")
for N, a in [(15, 7), (15, 2), (21, 2)]:
    ack, pc = run_cmd({"type": "RUN_SHOR", "N": N, "a": a})
    ref = run_shor(N, a)
    pq = ref["counting_probabilities"]
    d = max_dp(pc, pq)
    ok = d < TOL and ack.get("success")
    results.append(ok)
    print(
        f"  N={N} a={a}: order(C++)={ack.get('order')} factors={ack.get('factors')} "
        f"max|dp|={d:.2e} {'OK' if ok else 'FAIL'}"
    )

print("== DEUTSCH-JOZSA ==")
for n in [1, 2, 3, 4, 5]:
    for balanced in (False, True):
        ack, pc = run_cmd({"type": "RUN_DJ", "n_qubits": n, "balanced": balanced})
        ref = run_deutsch_jozsa(n, balanced)
        pq = ref["probabilities"]
        d = max_dp(pc, pq)
        ok = d < TOL and bool(ack.get("is_constant")) == ref["is_constant"]
        results.append(ok)
        kind = "balanceada" if balanced else "constante"
        print(
            f"  n={n} {kind}: is_constant(C++)={ack.get('is_constant')} "
            f"max|dp|={d:.2e} {'OK' if ok else 'FAIL'}"
        )

print("== BERNSTEIN-VAZIRANI ==")
for n in [1, 2, 3, 4, 5]:
    for hidden in range(1 << n):
        ack, pc = run_cmd({"type": "RUN_BV", "n_qubits": n, "hidden": hidden})
        ref = run_bernstein_vazirani(n, hidden)
        pq = ref["probabilities"]
        d = max_dp(pc, pq)
        ok = d < TOL and int(ack.get("recovered", -1)) == hidden == ref["recovered"]
        results.append(ok)
        if n <= 3 or hidden == (1 << n) - 1:
            print(
                f"  n={n} a={hidden:0{n}b}: recovered(C++)={ack.get('recovered')} "
                f"max|dp|={d:.2e} {'OK' if ok else 'FAIL'}"
            )

print("== QFT ==")
for n, m in [(2, 1), (3, 1), (4, 2), (4, 3), (4, 0), (5, 2)]:
    ack, pc = run_cmd({"type": "RUN_QFT", "n_qubits": n, "period_exp": m})
    ref = run_qft(n, m)
    pq = ref["probabilities"]
    d = max_dp(pc, pq)
    results.append(d < TOL)
    print(
        f"  n={n} m={m}: picos_ref={len(ref['peaks'])} max|dp|={d:.2e} "
        f"{'OK' if d < TOL else 'FAIL'}"
    )

req.send_string(json.dumps({"type": "SHUTDOWN"}))
req.recv_string()
print("\n" + ("VALIDATION PASSED" if all(results) else "VALIDATION FAILED"))
sys.exit(0 if all(results) else 1)
