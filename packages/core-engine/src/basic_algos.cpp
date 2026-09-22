#include "basic_algos.h"

#include <cmath>
#include <stdexcept>

namespace basic_algos {

void qftForward(QuantumStateVector& sv, int start, int t) {
    // QFT directa = inversa exacta de la inverseQFT validada en Shor (convención
    // little-endian: qubit `start` = bit menos significativo). Orden de bits
    // consistente con marginalProbabilities, de modo que un peine da picos limpios.
    for (int j = t - 1; j >= 0; --j) {
        sv.applyHadamard(start + j);
        for (int k = j - 1; k >= 0; --k) {
            const double angle = M_PI / std::pow(2.0, j - k);
            sv.applyCPhase(start + k, start + j, angle);
        }
    }
    for (int i = 0; i < t / 2; ++i) sv.applySwap(start + i, start + t - 1 - i);
}

DJResult deutschJozsa(int n, bool balanced, const ProbCallback& on_frame) {
    if (n < 1 || n > 19) throw std::invalid_argument("DJ: n en [1,19]");
    QuantumStateVector sv(n + 1);  // n entradas + 1 ancilla (qubit n)

    // Ancilla a |->: X luego H.
    sv.applyX(n);
    sv.applyHadamard(n);
    // Superposición uniforme en las entradas.
    for (int i = 0; i < n; ++i) sv.applyHadamard(i);
    on_frame(0, false, sv.marginalProbabilities(0, n));

    // Oráculo con phase kickback: balanceado = paridad (CNOT de cada entrada a
    // la ancilla); constante = identidad (f = 0).
    if (balanced)
        for (int i = 0; i < n; ++i) sv.applyCNOT(i, n);

    // H final sobre las entradas.
    for (int i = 0; i < n; ++i) sv.applyHadamard(i);
    const Eigen::VectorXd probs = sv.marginalProbabilities(0, n);
    on_frame(1, true, probs);

    DJResult r;
    r.is_constant = probs(0) > 0.5;  // constante <=> toda la prob en |0...0>
    return r;
}

BVResult bernsteinVazirani(int n, uint64_t hidden, const ProbCallback& on_frame) {
    if (n < 1 || n > 19) throw std::invalid_argument("BV: n en [1,19]");
    if (hidden >= (1ull << n)) throw std::invalid_argument("BV: hidden < 2^n");
    QuantumStateVector sv(n + 1);

    sv.applyX(n);
    sv.applyHadamard(n);
    for (int i = 0; i < n; ++i) sv.applyHadamard(i);
    on_frame(0, false, sv.marginalProbabilities(0, n));

    // Oráculo a·x: CNOT(entrada i -> ancilla) cuando el bit i de a es 1.
    for (int i = 0; i < n; ++i)
        if ((hidden >> i) & 1ull) sv.applyCNOT(i, n);

    for (int i = 0; i < n; ++i) sv.applyHadamard(i);
    const Eigen::VectorXd probs = sv.marginalProbabilities(0, n);
    on_frame(1, true, probs);

    BVResult r;
    int argmax = 0;
    probs.maxCoeff(&argmax);
    r.recovered = static_cast<uint64_t>(argmax);
    return r;
}

void qftDemo(int n, int period_exp, const ProbCallback& on_frame) {
    if (n < 1 || n > 16) throw std::invalid_argument("QFT: n en [1,16]");
    const int m = std::max(0, std::min(period_exp, n));
    QuantumStateVector sv(n);

    // Peine: uniforme sobre posiciones con los m bits bajos = 0 (espaciado 2^m).
    for (int q = m; q < n; ++q) sv.applyHadamard(q);
    on_frame(0, false, sv.marginalProbabilities(0, n));

    qftForward(sv, 0, n);
    on_frame(1, true, sv.marginalProbabilities(0, n));
}

}  // namespace basic_algos
