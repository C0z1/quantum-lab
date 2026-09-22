#pragma once
#include "state_vector.h"
#include <cstdint>
#include <functional>
#include <vector>

// Algoritmo de Shor: factorizacion via order-finding cuantico (QPE).
// La parte cuantica estima la fase s/r de U|y> = |a*y mod N>; el post-proceso
// clasico (fracciones continuas) recupera el periodo r y de ahi los factores.
namespace shor {

// Frame: distribucion marginal del registro de conteo (para visualizar los picos).
using FrameCallback =
    std::function<void(int step, bool is_final, const Eigen::VectorXd& counting_probs)>;

struct Result {
    uint64_t N = 0;
    uint64_t a = 0;
    int counting_qubits = 0;
    int work_qubits = 0;
    uint64_t order = 0;             // periodo r hallado (0 si falla)
    std::vector<uint64_t> factors;  // factores no triviales de N
    bool success = false;
};

// Numero de qubits de conteo recomendado: 2*ceil(log2 N).
int countingQubits(uint64_t N);

// Ejecuta Shor para N con base a (debe cumplir gcd(a,N)=1).
Result run(uint64_t N, uint64_t a, const FrameCallback& on_frame);

// Utilidades clasicas expuestas para tests.
uint64_t gcd(uint64_t x, uint64_t y);
uint64_t powmod(uint64_t base, uint64_t exp, uint64_t mod);
uint64_t classicalOrder(uint64_t a, uint64_t N);  // menor r con a^r = 1 mod N

}  // namespace shor
