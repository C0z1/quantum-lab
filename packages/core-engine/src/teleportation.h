#pragma once
#include "state_vector.h"
#include <Eigen/Dense>
#include <functional>

// Teletransportacion cuantica (3 qubits) con el principio de medicion diferida:
// las correcciones clasicas X/Z se sustituyen por CNOT/CZ controladas, de modo
// que todo el protocolo es un unitario fijo y el qubit destino (2) recupera
// exactamente el estado |psi> preparado en el qubit fuente (0).
namespace teleport {

using FrameCallback = std::function<void(int step, bool is_final, const QuantumStateVector&)>;

struct Result {
    Eigen::Vector3d source_bloch;  // Bloch del estado preparado |psi>
    Eigen::Vector3d dest_bloch;    // Bloch del qubit 2 al final
    double fidelity;               // <psi|rho_dest|psi>, debe ser 1
};

// Ejecuta la teleportacion de |psi> = cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>.
Result run(double theta, double phi, const FrameCallback& on_frame);

}  // namespace teleport
