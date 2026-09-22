#include "state_vector.h"
#include <cmath>
#include <stdexcept>

namespace {
constexpr double INV_SQRT2 = 0.7071067811865475244; // 1/sqrt(2)
}

QuantumStateVector::QuantumStateVector(int n_qubits) : n_qubits_(n_qubits) {
    if (n_qubits < 1 || n_qubits > 20) {
        // §8: el motor rechaza n_qubits > 20 (2^20 amplitudes ~ limite de memoria).
        throw std::invalid_argument("n_qubits must be in [1, 20]");
    }
    sv_ = StateVector(dim());
    reset();
}

void QuantumStateVector::reset() {
    sv_.setZero();
    sv_(0) = Amplitude(1.0, 0.0); // |0...0>
}

// --- Puertas de un qubit via manipulacion directa de amplitudes (in-place) ---
// Esto evita construir matrices 2^n x 2^n y permite n hasta 20.
// Convencion little-endian: el qubit q corresponde al bit q del indice de estado.

void QuantumStateVector::applyHadamard(int qubit) {
    if (qubit < 0 || qubit >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t stride = int64_t(1) << qubit;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        if (i & stride) continue;           // procesar solo la mitad con bit=0
        const int64_t j = i | stride;
        const Amplitude a = sv_(i);
        const Amplitude b = sv_(j);
        sv_(i) = INV_SQRT2 * (a + b);
        sv_(j) = INV_SQRT2 * (a - b);
    }
}

void QuantumStateVector::applyHadamardAll() {
    for (int q = 0; q < n_qubits_; ++q) applyHadamard(q);
}

void QuantumStateVector::applyX(int qubit) {
    if (qubit < 0 || qubit >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t stride = int64_t(1) << qubit;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        if (i & stride) continue;
        const int64_t j = i | stride;
        std::swap(sv_(i), sv_(j));
    }
}

void QuantumStateVector::applyCNOT(int control, int target) {
    if (control == target) throw std::invalid_argument("control == target");
    if (control < 0 || control >= n_qubits_ || target < 0 || target >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t cmask = int64_t(1) << control;
    const int64_t tmask = int64_t(1) << target;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        // Intercambiar amplitudes de target cuando control=1, procesando target=0.
        if ((i & cmask) && !(i & tmask)) {
            std::swap(sv_(i), sv_(i | tmask));
        }
    }
}

void QuantumStateVector::applyToffoli(int c1, int c2, int target) {
    if (c1 == c2 || c1 == target || c2 == target)
        throw std::invalid_argument("Toffoli qubits must be distinct");
    if (c1 < 0 || c1 >= n_qubits_ || c2 < 0 || c2 >= n_qubits_ ||
        target < 0 || target >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t m1 = int64_t(1) << c1;
    const int64_t m2 = int64_t(1) << c2;
    const int64_t tmask = int64_t(1) << target;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        if ((i & m1) && (i & m2) && !(i & tmask)) {
            std::swap(sv_(i), sv_(i | tmask));
        }
    }
}

void QuantumStateVector::applyPhase(int qubit, double theta) {
    if (qubit < 0 || qubit >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t stride = int64_t(1) << qubit;
    const Amplitude phase = std::polar(1.0, theta); // e^{i theta}
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        if (i & stride) sv_(i) *= phase;
    }
}

void QuantumStateVector::applyRY(int qubit, double theta) {
    if (qubit < 0 || qubit >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const double c = std::cos(theta / 2.0);
    const double s = std::sin(theta / 2.0);
    const int64_t stride = int64_t(1) << qubit;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        if (i & stride) continue;
        const int64_t j = i | stride;
        const Amplitude a = sv_(i);
        const Amplitude b = sv_(j);
        sv_(i) = c * a - s * b;
        sv_(j) = s * a + c * b;
    }
}

void QuantumStateVector::applyRZ(int qubit, double theta) {
    if (qubit < 0 || qubit >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const Amplitude p0 = std::polar(1.0, -theta / 2.0);
    const Amplitude p1 = std::polar(1.0, theta / 2.0);
    const int64_t stride = int64_t(1) << qubit;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i)
        sv_(i) *= (i & stride) ? p1 : p0;
}

void QuantumStateVector::applyCPhase(int control, int target, double theta) {
    if (control == target) throw std::invalid_argument("control == target");
    if (control < 0 || control >= n_qubits_ || target < 0 || target >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t cmask = int64_t(1) << control;
    const int64_t tmask = int64_t(1) << target;
    const Amplitude phase = std::polar(1.0, theta);
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i)
        if ((i & cmask) && (i & tmask)) sv_(i) *= phase;
}

void QuantumStateVector::applyCZ(int a, int b) {
    applyCPhase(a, b, M_PI); // e^{i pi} = -1 cuando ambos bits valen 1
}

void QuantumStateVector::applySwap(int a, int b) {
    if (a == b) return;
    if (a < 0 || a >= n_qubits_ || b < 0 || b >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    const int64_t ma = int64_t(1) << a;
    const int64_t mb = int64_t(1) << b;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        const bool bit_a = i & ma;
        const bool bit_b = i & mb;
        if (bit_a && !bit_b) {
            std::swap(sv_(i), sv_((i & ~ma) | mb));
        }
    }
}

void QuantumStateVector::prepareSingleQubit(int qubit, double theta, double phi) {
    // Desde |...0...> lleva el qubit a cos(t/2)|0> + e^{i phi} sin(t/2)|1>.
    applyRY(qubit, theta);
    applyRZ(qubit, phi);
    // Rz introduce una fase global irrelevante; ajustamos para dejar la amplitud
    // de |0> real positiva (convencion, no afecta observables).
}

Eigen::Vector3d QuantumStateVector::blochVector(int qubit) const {
    if (qubit < 0 || qubit >= n_qubits_)
        throw std::out_of_range("qubit index out of range");
    // Matriz densidad reducida 2x2 del qubit, trazando el resto.
    Amplitude r00(0, 0), r11(0, 0), r01(0, 0);
    const int64_t stride = int64_t(1) << qubit;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        if (i & stride) continue;
        const int64_t j = i | stride;
        const Amplitude a = sv_(i); // qubit = 0
        const Amplitude b = sv_(j); // qubit = 1
        r00 += a * std::conj(a);
        r11 += b * std::conj(b);
        r01 += a * std::conj(b);
    }
    Eigen::Vector3d bloch;
    bloch.x() = 2.0 * r01.real();
    bloch.y() = -2.0 * r01.imag();
    bloch.z() = (r00 - r11).real();
    return bloch;
}

void QuantumStateVector::applyControlledModMul(int control_qubit, int work_start,
                                               int work_qubits, uint64_t mult,
                                               uint64_t modulus) {
    if (control_qubit < 0 || control_qubit >= n_qubits_)
        throw std::out_of_range("control qubit out of range");
    if (work_start < 0 || work_start + work_qubits > n_qubits_)
        throw std::out_of_range("work register out of range");
    const int64_t cmask = int64_t(1) << control_qubit;
    const int64_t work_mask = ((int64_t(1) << work_qubits) - 1) << work_start;
    const int64_t n = dim();
    StateVector out = sv_; // copia: los estados no afectados se conservan
    for (int64_t i = 0; i < n; ++i) {
        if (!(i & cmask)) continue; // control 0 -> identidad (ya en out)
        const uint64_t y = static_cast<uint64_t>((i & work_mask) >> work_start);
        if (y >= modulus) continue; // fuera del dominio -> identidad
        const uint64_t y2 = (mult % modulus) * y % modulus;
        const int64_t i2 = (i & ~work_mask) |
                           (static_cast<int64_t>(y2) << work_start);
        out(i2) = sv_(i);
    }
    sv_ = out;
}

Eigen::VectorXd QuantumStateVector::marginalProbabilities(int start, int count) const {
    if (start < 0 || start + count > n_qubits_)
        throw std::out_of_range("sub-register out of range");
    Eigen::VectorXd m = Eigen::VectorXd::Zero(int64_t(1) << count);
    const int64_t mask = ((int64_t(1) << count) - 1) << start;
    const int64_t n = dim();
    for (int64_t i = 0; i < n; ++i) {
        const int64_t v = (i & mask) >> start;
        const double re = sv_(i).real(), im = sv_(i).imag();
        m(v) += re * re + im * im;
    }
    return m;
}

// --- Primitivas de Grover ---

void QuantumStateVector::applyOracle(int target_state) {
    if (target_state < 0 || target_state >= dim())
        throw std::out_of_range("target_state out of range");
    sv_(target_state) *= -1.0; // invierte la fase del estado marcado
}

void QuantumStateVector::applyDiffuser() {
    // Reflexion sobre la media: (2|s><s| - I)|phi>, con |s> superposicion uniforme.
    // new_i = 2*mean - phi_i, donde mean = (1/N) sum_j phi_j.
    const int64_t n = dim();
    Amplitude mean(0.0, 0.0);
    for (int64_t i = 0; i < n; ++i) mean += sv_(i);
    mean /= static_cast<double>(n);
    for (int64_t i = 0; i < n; ++i) sv_(i) = 2.0 * mean - sv_(i);
}

// --- Probabilidades ---

Eigen::VectorXd QuantumStateVector::probabilities() const {
    // |alpha|^2 = re^2 + im^2 para cada amplitud.
    return sv_.cwiseAbs2();
}

// --- Helpers de algebra (interfaz §4.1). Usados para n pequeno / validacion. ---

Eigen::MatrixXcd QuantumStateVector::kronecker(const Eigen::MatrixXcd& A,
                                               const Eigen::MatrixXcd& B) const {
    const int ar = A.rows(), ac = A.cols();
    const int br = B.rows(), bc = B.cols();
    Eigen::MatrixXcd K(ar * br, ac * bc);
    for (int i = 0; i < ar; ++i)
        for (int j = 0; j < ac; ++j)
            K.block(i * br, j * bc, br, bc) = A(i, j) * B;
    return K;
}

Eigen::MatrixXcd QuantumStateVector::gateMatrix(int qubit,
                                                const Eigen::MatrixXcd& gate) const {
    // Construye el operador de n qubits: I_{n-1} (x) ... (x) gate_q (x) ... (x) I_0
    // (little-endian: el factor mas a la derecha es el qubit 0).
    Eigen::MatrixXcd I2 = Eigen::MatrixXcd::Identity(2, 2);
    Eigen::MatrixXcd result(1, 1);
    result(0, 0) = Amplitude(1.0, 0.0);
    for (int q = n_qubits_ - 1; q >= 0; --q) {
        result = kronecker(result, (q == qubit) ? gate : I2);
    }
    return result;
}
