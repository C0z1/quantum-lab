#include "teleportation.h"
#include <cmath>

namespace teleport {

static Eigen::Vector3d idealBloch(double theta, double phi) {
    return { std::sin(theta) * std::cos(phi),
             std::sin(theta) * std::sin(phi),
             std::cos(theta) };
}

Result run(double theta, double phi, const FrameCallback& on_frame) {
    QuantumStateVector sv(3); // 0 = fuente |psi>, 1 = Alice, 2 = Bob/destino

    // Paso 0: preparar |psi> en el qubit 0.
    sv.prepareSingleQubit(0, theta, phi);
    on_frame(0, false, sv);

    // Paso 1: par de Bell entre qubits 1 y 2.
    sv.applyHadamard(1);
    sv.applyCNOT(1, 2);
    on_frame(1, false, sv);

    // Paso 2: Alice enreda su qubit con |psi> y mide en base de Bell (H).
    sv.applyCNOT(0, 1);
    sv.applyHadamard(0);
    on_frame(2, false, sv);

    // Paso 3: correcciones diferidas (equivalen a las condicionadas por medida).
    sv.applyCNOT(1, 2); // corrige bit X segun qubit 1
    sv.applyCZ(0, 2);   // corrige fase Z segun qubit 0
    on_frame(3, true, sv);

    Result r;
    r.source_bloch = idealBloch(theta, phi);
    r.dest_bloch = sv.blochVector(2);
    r.fidelity = 0.5 * (1.0 + r.source_bloch.dot(r.dest_bloch));
    return r;
}

} // namespace teleport
