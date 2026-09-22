#include "zmq_server.h"
#include "grover.h"
#include "teleportation.h"
#include "shor.h"
#include "basic_algos.h"
#include <nlohmann/json.hpp>
#include <msgpack.hpp>
#include <iostream>
#include <sstream>
#include <chrono>
#include <thread>

using json = nlohmann::json;

static constexpr int MAX_QUBITS = 20;      // §8
static constexpr int RCV_TIMEO_MS = 5000;  // §8: ZMQ_RCVTIMEO
static const std::string STREAM_TOPIC = "statevec";

ZmqServer::ZmqServer(std::string cmd_endpoint, std::string stream_endpoint)
    : cmd_endpoint_(std::move(cmd_endpoint)),
      stream_endpoint_(std::move(stream_endpoint)),
      ctx_(1),
      rep_(ctx_, zmq::socket_type::rep),
      pub_(ctx_, zmq::socket_type::pub),
      running_(true) {
    rep_.set(zmq::sockopt::rcvtimeo, RCV_TIMEO_MS);
    rep_.set(zmq::sockopt::linger, 0);
    pub_.set(zmq::sockopt::linger, 0);
    rep_.bind(cmd_endpoint_);
    pub_.bind(stream_endpoint_);
    std::cerr << "[engine] REP bound  -> " << cmd_endpoint_ << "\n";
    std::cerr << "[engine] PUB bound  -> " << stream_endpoint_ << "\n";
}

ZmqServer::~ZmqServer() {
    rep_.close();
    pub_.close();
    ctx_.close();
}

StateVectorFrame ZmqServer::buildFrame(uint32_t iteration, bool is_final,
                                       const QuantumStateVector& sv) const {
    StateVectorFrame f;
    f.iteration = iteration;
    f.n_qubits = static_cast<uint32_t>(sv.n_qubits());
    f.state_size = static_cast<uint32_t>(sv.dim());
    f.is_final = is_final;
    f.data.reserve(static_cast<size_t>(sv.dim()) * 3);
    const auto& st = sv.state();
    for (int i = 0; i < sv.dim(); ++i) {
        const double re = st(i).real();
        const double im = st(i).imag();
        f.data.push_back(re);
        f.data.push_back(im);
        f.data.push_back(re * re + im * im);  // prob precalculada (§2)
    }
    return f;
}

void ZmqServer::publishFrame(const StateVectorFrame& frame) {
    // Serializar a MessagePack.
    msgpack::sbuffer sbuf;
    msgpack::pack(sbuf, frame);
    // Enviar multiparte: [topic][payload] para filtrado por SUB.
    zmq::message_t topic_msg(STREAM_TOPIC.data(), STREAM_TOPIC.size());
    pub_.send(topic_msg, zmq::send_flags::sndmore);
    zmq::message_t payload(sbuf.data(), sbuf.size());
    pub_.send(payload, zmq::send_flags::none);
}

StateVectorFrame ZmqServer::buildFrameFromProbs(uint32_t iteration, bool is_final,
                                                uint32_t n_qubits,
                                                const Eigen::VectorXd& probs) const {
    StateVectorFrame f;
    f.iteration = iteration;
    f.n_qubits = n_qubits;
    f.state_size = static_cast<uint32_t>(probs.size());
    f.is_final = is_final;
    f.data.reserve(static_cast<size_t>(probs.size()) * 3);
    for (int i = 0; i < probs.size(); ++i) {
        const double p = probs(i);
        f.data.push_back(std::sqrt(p));  // re (fase no observable en marginal)
        f.data.push_back(0.0);           // im
        f.data.push_back(p);             // prob
    }
    return f;
}

void ZmqServer::handleRunGrover(int n_qubits, int target_state, int iterations,
                                bool stream_intermediate) {
    try {
        grover::run(n_qubits, target_state, iterations,
                    [&](int iteration, bool is_final, const QuantumStateVector& sv) {
                        if (!stream_intermediate && !is_final && iteration != 0) return;
                        publishFrame(buildFrame(static_cast<uint32_t>(iteration), is_final, sv));
                    });
    } catch (const std::exception& e) {
        std::cerr << "[engine] grover error: " << e.what() << "\n";
    }
}

std::string ZmqServer::dispatch(const std::string& json_cmd) {
    json j;
    try {
        j = json::parse(json_cmd);
    } catch (const std::exception& e) {
        return json{{"status", "ERROR"}, {"error", "invalid JSON"}}.dump();
    }

    const std::string type = j.value("type", "");

    if (type == "PING") {
        return json{{"status", "PONG"}}.dump();
    }

    if (type == "RUN_GROVER") {
        const int n = j.value("n_qubits", 0);
        const int target = j.value("target_state", 0);
        const int iters = j.value("iterations", 0);
        const bool stream = j.value("stream_intermediate", true);

        // Validacion (§8): rango de qubits y estado objetivo.
        if (n < 1 || n > MAX_QUBITS)
            return json{{"status", "ERROR"}, {"error", "n_qubits out of range [1,20]"}}.dump();
        if (target < 0 || target >= (1 << n))
            return json{{"status", "ERROR"}, {"error", "target_state out of range"}}.dump();

        // ACK inmediato + computo en un hilo separado (§10: no bloquear REP).
        std::thread([this, n, target, iters, stream]() {
            handleRunGrover(n, target, iters, stream);
        }).detach();

        return json{
            {"status", "ACK"}, {"type", "RUN_GROVER"}, {"n_qubits", n}, {"target_state", target}}
            .dump();
    }

    if (type == "RUN_TELEPORTATION") {
        // Estado |psi> parametrizado por (theta, phi) en la esfera de Bloch.
        const double theta = j.value("theta", M_PI / 3.0);
        const double phi = j.value("phi", M_PI / 4.0);
        // Rapido (3 qubits): computo sincrono y resultado en el ACK.
        double fidelity = 0.0;
        try {
            auto r = teleport::run(
                theta, phi, [&](int step, bool is_final, const QuantumStateVector& sv) {
                    publishFrame(buildFrame(static_cast<uint32_t>(step), is_final, sv));
                });
            fidelity = r.fidelity;
        } catch (const std::exception& e) {
            return json{{"status", "ERROR"}, {"error", e.what()}}.dump();
        }
        return json{{"status", "ACK"},
                    {"type", "RUN_TELEPORTATION"},
                    {"theta", theta},
                    {"phi", phi},
                    {"fidelity", fidelity}}
            .dump();
    }

    if (type == "RUN_SHOR") {
        const uint64_t N = j.value("N", 15ULL);
        const uint64_t a = j.value("a", 7ULL);
        if (N < 3) return json{{"status", "ERROR"}, {"error", "N must be >= 3"}}.dump();
        if (a < 2 || a >= N)
            return json{{"status", "ERROR"}, {"error", "require 2 <= a < N"}}.dump();
        try {
            auto r = shor::run(N, a, [&](int step, bool is_final, const Eigen::VectorXd& probs) {
                uint32_t nq = 0;
                while ((uint64_t(1) << nq) < (uint64_t)probs.size()) ++nq;
                publishFrame(buildFrameFromProbs(static_cast<uint32_t>(step), is_final, nq, probs));
            });
            return json{{"status", "ACK"},
                        {"type", "RUN_SHOR"},
                        {"N", N},
                        {"a", a},
                        {"order", r.order},
                        {"factors", r.factors},
                        {"success", r.success}}
                .dump();
        } catch (const std::exception& e) {
            return json{{"status", "ERROR"}, {"error", e.what()}}.dump();
        }
    }

    if (type == "RUN_DJ") {
        const int n = j.value("n_qubits", 3);
        const bool balanced = j.value("balanced", true);
        if (n < 1 || n > 19) return json{{"status", "ERROR"}, {"error", "n en [1,19]"}}.dump();
        auto pub = [&](int step, bool is_final, const Eigen::VectorXd& p) {
            uint32_t nq = 0;
            while ((uint64_t(1) << nq) < (uint64_t)p.size()) ++nq;
            publishFrame(buildFrameFromProbs(static_cast<uint32_t>(step), is_final, nq, p));
        };
        auto r = basic_algos::deutschJozsa(n, balanced, pub);
        return json{{"status", "ACK"},
                    {"type", "RUN_DJ"},
                    {"n_qubits", n},
                    {"balanced", balanced},
                    {"is_constant", r.is_constant}}
            .dump();
    }

    if (type == "RUN_BV") {
        const int n = j.value("n_qubits", 4);
        const uint64_t hidden = j.value("hidden", 0ull);
        if (n < 1 || n > 19) return json{{"status", "ERROR"}, {"error", "n en [1,19]"}}.dump();
        if (hidden >= (1ull << n))
            return json{{"status", "ERROR"}, {"error", "hidden < 2^n"}}.dump();
        auto pub = [&](int step, bool is_final, const Eigen::VectorXd& p) {
            uint32_t nq = 0;
            while ((uint64_t(1) << nq) < (uint64_t)p.size()) ++nq;
            publishFrame(buildFrameFromProbs(static_cast<uint32_t>(step), is_final, nq, p));
        };
        auto r = basic_algos::bernsteinVazirani(n, hidden, pub);
        return json{{"status", "ACK"},
                    {"type", "RUN_BV"},
                    {"n_qubits", n},
                    {"hidden", hidden},
                    {"recovered", r.recovered}}
            .dump();
    }

    if (type == "RUN_QFT") {
        const int n = j.value("n_qubits", 4);
        const int m = j.value("period_exp", 2);
        if (n < 1 || n > 16) return json{{"status", "ERROR"}, {"error", "n en [1,16]"}}.dump();
        auto pub = [&](int step, bool is_final, const Eigen::VectorXd& p) {
            uint32_t nq = 0;
            while ((uint64_t(1) << nq) < (uint64_t)p.size()) ++nq;
            publishFrame(buildFrameFromProbs(static_cast<uint32_t>(step), is_final, nq, p));
        };
        basic_algos::qftDemo(n, m, pub);
        return json{{"status", "ACK"}, {"type", "RUN_QFT"}, {"n_qubits", n}, {"period_exp", m}}
            .dump();
    }

    if (type == "SHUTDOWN") {
        running_ = false;
        return json{{"status", "ACK"}, {"type", "SHUTDOWN"}}.dump();
    }

    return json{{"status", "ERROR"}, {"error", "unknown command type"}}.dump();
}

void ZmqServer::run() {
    std::cerr << "[engine] server loop started\n";
    while (running_) {
        zmq::message_t request;
        zmq::recv_result_t res = rep_.recv(request, zmq::recv_flags::none);
        if (!res.has_value()) {
            // Timeout (ZMQ_RCVTIMEO): seguir escuchando.
            continue;
        }
        const std::string cmd(static_cast<char*>(request.data()), request.size());
        const std::string reply = dispatch(cmd);
        zmq::message_t reply_msg(reply.data(), reply.size());
        rep_.send(reply_msg, zmq::send_flags::none);
    }
    std::cerr << "[engine] server loop stopped\n";
}
