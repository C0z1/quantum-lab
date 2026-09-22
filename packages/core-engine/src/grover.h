#pragma once
#include "state_vector.h"
#include <functional>

// Algoritmo de Grover. Ejecuta la busqueda y entrega el estado tras cada paso
// mediante un callback, para que el servidor ZMQ pueda publicar frames en vivo.
namespace grover {

// Callback de frame: (iteracion, es_final, estado_actual).
// iteration == 0 corresponde a la superposicion inicial.
using FrameCallback = std::function<void(int iteration, bool is_final, const QuantumStateVector&)>;

// Numero optimo de iteraciones ~ floor(pi/4 * sqrt(N)), N = 2^n.
int optimalIterations(int n_qubits);

// Ejecuta Grover. Si iterations <= 0 usa optimalIterations(n_qubits).
// Devuelve el numero de iteraciones efectivamente ejecutadas.
int run(int n_qubits, int target_state, int iterations, const FrameCallback& on_frame);

}  // namespace grover
