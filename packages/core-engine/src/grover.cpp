#include "grover.h"
#include <cmath>
#include <stdexcept>

namespace grover {

int optimalIterations(int n_qubits) {
    const double N = static_cast<double>(int64_t(1) << n_qubits);
    // Angulo por iteracion theta, sin(theta/2) = 1/sqrt(N).
    // Iteraciones optimas ~ floor(pi/4 * sqrt(N)).
    int it = static_cast<int>(std::floor(M_PI / 4.0 * std::sqrt(N)));
    return it < 1 ? 1 : it;
}

int run(int n_qubits, int target_state, int iterations,
        const FrameCallback& on_frame) {
    QuantumStateVector sv(n_qubits);

    if (target_state < 0 || target_state >= sv.dim())
        throw std::out_of_range("target_state out of range for n_qubits");

    const int iters = (iterations > 0) ? iterations : optimalIterations(n_qubits);

    // 1-2. Superposicion uniforme.
    sv.applyHadamardAll();
    // 3. Frame inicial (iteracion 0).
    on_frame(0, false, sv);

    // 4. Iteraciones de Grover.
    for (int i = 1; i <= iters; ++i) {
        sv.applyOracle(target_state); // a. inversion de fase del objetivo
        sv.applyDiffuser();           // b. amplificacion de amplitud
        const bool is_final = (i == iters);
        on_frame(i, is_final, sv);    // c. publicar frame
    }

    return iters;
}

} // namespace grover
