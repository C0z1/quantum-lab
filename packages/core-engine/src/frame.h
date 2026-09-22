#pragma once
#include <cstdint>
#include <vector>
#include <msgpack.hpp>

// Frame del vector de estado publicado por el socket PUB (topic "statevec").
// Layout de `data`: [re0, im0, prob0, re1, im1, prob1, ...] (§2).
// prob se precalcula en C++ como |alpha|^2 = re^2 + im^2.
struct StateVectorFrame {
    uint32_t iteration = 0;  // 0 = estado inicial, N = iteracion N
    uint32_t n_qubits = 0;
    uint32_t state_size = 0;  // 2^n_qubits
    bool is_final = false;
    std::vector<double> data;  // 3 * state_size elementos

    MSGPACK_DEFINE(iteration, n_qubits, state_size, is_final, data);
};
