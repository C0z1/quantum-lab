#pragma once
#include <Eigen/Dense>
#include <cstdint>
#include <functional>

#include "state_vector.h"

// Algoritmos fundamentales que reutilizan el motor de vector de estado:
//   - Deutsch-Jozsa: decide si f es constante o balanceada con 1 consulta.
//   - Bernstein-Vazirani: recupera la cadena oculta a con 1 consulta.
//   - QFT: transformada cuántica de Fourier como analizador de frecuencia.
// Todos publican la distribución marginal de su registro relevante por frame.
namespace basic_algos {

using ProbCallback = std::function<void(int step, bool is_final, const Eigen::VectorXd& probs)>;

// ----- Deutsch-Jozsa -----
struct DJResult {
    bool is_constant = false;
};
// n = qubits de entrada (1..19); balanced elige el oráculo (paridad) o constante.
DJResult deutschJozsa(int n, bool balanced, const ProbCallback& on_frame);

// ----- Bernstein-Vazirani -----
struct BVResult {
    uint64_t recovered = 0;
};
// n = qubits de entrada; hidden = cadena oculta a (< 2^n).
BVResult bernsteinVazirani(int n, uint64_t hidden, const ProbCallback& on_frame);

// ----- QFT -----
// n qubits; period_exp m in [0,n]: prepara un peine uniforme sobre las posiciones
// cuyos m bits bajos son 0 (espaciado 2^m) y aplica la QFT -> 2^m picos.
void qftDemo(int n, int period_exp, const ProbCallback& on_frame);

// QFT directa in-place sobre [start, start+t) (expuesta para tests).
void qftForward(QuantumStateVector& sv, int start, int t);

}  // namespace basic_algos
