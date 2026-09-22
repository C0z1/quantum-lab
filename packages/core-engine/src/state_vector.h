#pragma once
#include <Eigen/Dense>
#include <complex>
#include <vector>
#include <cstdint>

// Tipos base del motor cuantico.
using Amplitude   = std::complex<double>;
using StateVector = Eigen::VectorXcd;   // Vector columna de complejos, tamano dinamico

// QuantumStateVector: gestiona el vector de estado de un sistema de n qubits.
// El estado vive siempre como Eigen::VectorXcd de dimension 2^n (nunca std::vector).
// Convencion de indexado: el qubit 0 es el bit MENOS significativo del indice de
// estado (little-endian), consistente con Qiskit.
class QuantumStateVector {
public:
    explicit QuantumStateVector(int n_qubits);

    void reset();                              // Estado |0...0>
    void applyHadamardAll();                   // H^{tensor n}: superposicion uniforme
    void applyHadamard(int qubit);             // H sobre un qubit especifico
    void applyX(int qubit);                    // Puerta X (NOT)
    void applyCNOT(int control, int target);   // CNOT
    void applyToffoli(int c1, int c2, int target); // CCX
    void applyPhase(int qubit, double theta);  // Puerta de fase R(theta)
    void applyRY(int qubit, double theta);     // Rotacion Ry(theta)
    void applyRZ(int qubit, double theta);     // Rotacion Rz(theta)
    void applyCZ(int a, int b);                // Z controlada (simetrica)
    void applyCPhase(int control, int target, double theta); // fase controlada
    void applySwap(int a, int b);              // intercambio de dos qubits
    // Prepara el qubit en cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>.
    void prepareSingleQubit(int qubit, double theta, double phi);
    void applyOracle(int target_state);        // Oraculo de Grover: fase -1 al estado objetivo
    void applyDiffuser();                       // Difusor de Grover (2|psi><psi| - I)

    // Vector de Bloch (x,y,z) del qubit q, trazando el resto (para esferas UI).
    Eigen::Vector3d blochVector(int qubit) const;

    // Multiplicacion modular controlada (para Shor): si el qubit de control vale
    // 1, mapea el valor y del registro de trabajo [work_start, work_start+work_qubits)
    // a (mult * y) mod modulus (permutacion para y < modulus; identidad si no).
    void applyControlledModMul(int control_qubit, int work_start, int work_qubits,
                               uint64_t mult, uint64_t modulus);

    // Distribucion marginal de probabilidad de un sub-registro contiguo
    // [start, start+count) trazando el resto. Devuelve 2^count valores.
    Eigen::VectorXd marginalProbabilities(int start, int count) const;

    // Acceso al estado
    const StateVector& state() const { return sv_; }
    int dim() const { return 1 << n_qubits_; }
    int n_qubits() const { return n_qubits_; }

    // Vector de probabilidades |alpha|^2
    Eigen::VectorXd probabilities() const;

    // Norma L2 al cuadrado (invariante cuantico: debe ser 1.0)
    double normSquared() const { return sv_.squaredNorm(); }

private:
    int n_qubits_;
    StateVector sv_;

    // Producto de Kronecker para construir operadores de n qubits.
    Eigen::MatrixXcd kronecker(const Eigen::MatrixXcd& A,
                               const Eigen::MatrixXcd& B) const;

    // Construye el operador de n qubits que aplica `gate` (1 qubit) sobre `qubit`.
    Eigen::MatrixXcd gateMatrix(int qubit, const Eigen::MatrixXcd& gate) const;
};
