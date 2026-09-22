#include "zmq_server.h"
#include <csignal>
#include <cstdlib>
#include <iostream>
#include <string>

// Entry point del motor cuantico C++.
// Arranca el servidor ZeroMQ (REP + PUB). Endpoints configurables por env vars:
//   QL_CMD_ENDPOINT    (default ipc:///tmp/quantum-lab-cmd)
//   QL_STREAM_ENDPOINT (default ipc:///tmp/quantum-lab-stream)

static ZmqServer* g_server = nullptr;

static void handleSignal(int) {
    if (g_server) g_server->stop();
}

static std::string envOr(const char* name, const std::string& def) {
    const char* v = std::getenv(name);
    return v ? std::string(v) : def;
}

int main() {
    // TCP en loopback: portable (funciona en Linux, macOS y Windows nativo).
    const std::string cmd_ep = envOr("QL_CMD_ENDPOINT", "tcp://127.0.0.1:5770");
    const std::string stream_ep = envOr("QL_STREAM_ENDPOINT", "tcp://127.0.0.1:5771");

    std::signal(SIGINT, handleSignal);
    std::signal(SIGTERM, handleSignal);

    try {
        ZmqServer server(cmd_ep, stream_ep);
        g_server = &server;
        std::cerr << "[engine] Quantum Lab core-engine ready.\n";
        server.run();
    } catch (const std::exception& e) {
        std::cerr << "[engine] fatal: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
