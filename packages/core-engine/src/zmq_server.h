#pragma once
#include <string>
#include <atomic>
#include <zmq.hpp>
#include "frame.h"
#include "state_vector.h"

// Servidor del motor cuantico.
//   - REP socket (cmd):    recibe comandos JSON, responde ACK inmediato (§10).
//   - PUB socket (stream): publica frames del vector de estado (MessagePack).
//
// Endpoints por defecto (§2):
//   cmd    -> ipc:///tmp/quantum-lab-cmd
//   stream -> ipc:///tmp/quantum-lab-stream
class ZmqServer {
public:
    ZmqServer(std::string cmd_endpoint, std::string stream_endpoint);
    ~ZmqServer();

    // Bucle principal. Bloquea hasta recibir un comando SHUTDOWN o una senal.
    void run();

    void stop() { running_ = false; }

private:
    std::string cmd_endpoint_;
    std::string stream_endpoint_;
    zmq::context_t ctx_;
    zmq::socket_t rep_;
    zmq::socket_t pub_;
    std::atomic<bool> running_;

    // Publica un frame por el socket PUB con el topic "statevec".
    void publishFrame(const StateVectorFrame& frame);

    // Construye un frame a partir del estado actual.
    StateVectorFrame buildFrame(uint32_t iteration, bool is_final,
                                const QuantumStateVector& sv) const;

    // Dispatch de un comando JSON ya parseado. Devuelve el cuerpo del ACK.
    std::string dispatch(const std::string& json_cmd);

    // Construye un frame a partir de una distribucion de probabilidad marginal
    // (usado por Shor: re=sqrt(p), im=0, prob=p).
    StateVectorFrame buildFrameFromProbs(uint32_t iteration, bool is_final,
                                         uint32_t n_qubits,
                                         const Eigen::VectorXd& probs) const;

    // Handler de RUN_GROVER: ejecuta y publica frames (asincrono).
    void handleRunGrover(int n_qubits, int target_state, int iterations,
                         bool stream_intermediate);
};
