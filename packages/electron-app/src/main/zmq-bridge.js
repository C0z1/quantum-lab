// QuantumBridge: puente ZeroMQ entre el proceso Main de Electron y el motor C++.
//   - REQ socket  -> envia comandos JSON, espera ACK (ipc:///tmp/quantum-lab-cmd)
//   - SUB socket  -> recibe frames MessagePack del vector de estado (topic "statevec")
//
// npm install zeromq msgpackr
const { Request, Subscriber } = require('zeromq');
const { unpack } = require('msgpackr');
const { EventEmitter } = require('events');

const DEFAULT_CMD = process.env.QL_CMD_ENDPOINT || 'tcp://127.0.0.1:5770';
const DEFAULT_STREAM = process.env.QL_STREAM_ENDPOINT || 'tcp://127.0.0.1:5771';
const STREAM_TOPIC = 'statevec';

class QuantumBridge extends EventEmitter {
  // endpoints: { cmd, stream } — si se omiten, usa env/defaults.
  constructor(endpoints = {}) {
    super();
    this._cmdEndpoint = endpoints.cmd || DEFAULT_CMD;
    this._streamEndpoint = endpoints.stream || DEFAULT_STREAM;
    this._req = new Request();
    this._req.receiveTimeout = 5000; // §8: ZMQ_RCVTIMEO = 5000ms
    this._sub = new Subscriber();
    this._connected = false;
    this._running = false;
  }

  async connect() {
    // ZeroMQ reconecta automáticamente a estos endpoints si el motor se reinicia.
    this._req.connect(this._cmdEndpoint);
    this._sub.connect(this._streamEndpoint);
    this._sub.subscribe(STREAM_TOPIC);
    this._connected = true;
    this._running = true;
    this.emit('status', { connected: true });
    this._startSubscribeLoop(); // no await: corre en segundo plano
  }

  // Envia un comando (objeto) como JSON por REQ y espera el ACK JSON.
  async sendCommand(cmd) {
    if (!this._connected) throw new Error('bridge not connected');
    await this._req.send(JSON.stringify(cmd));
    const [reply] = await this._req.receive();
    return JSON.parse(reply.toString());
  }

  // Bucle de recepcion de frames del socket SUB.
  async _startSubscribeLoop() {
    try {
      for await (const parts of this._sub) {
        if (!this._running) break;
        // Mensaje multiparte: [topic, payload]
        const payload = parts.length > 1 ? parts[1] : parts[0];
        const frame = this._buildTransferableFrame(payload);
        this.emit('state-update', frame);
      }
    } catch (err) {
      if (this._running) this.emit('error', err);
    }
  }

  // MsgPack (array) -> objeto con Float64Array para transferir al Renderer.
  _buildTransferableFrame(raw) {
    // C++ empaqueta el struct como array: [iteration, n_qubits, state_size, is_final, data]
    const arr = unpack(raw);
    const [iteration, nQubits, stateSize, isFinal, data] = arr;
    return {
      iteration,
      nQubits,
      stateSize,
      isFinal,
      data: Float64Array.from(data), // layout [re,im,prob,...]
    };
  }

  disconnect() {
    this._running = false;
    this._connected = false;
    try {
      this._sub.close();
    } catch (_) {}
    try {
      this._req.close();
    } catch (_) {}
    this.emit('status', { connected: false });
  }
}

module.exports = { QuantumBridge, DEFAULT_CMD, DEFAULT_STREAM };
