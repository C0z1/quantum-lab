// QuantumBridge: puente ZeroMQ entre el proceso Main de Electron y el motor C++.
//   - REQ socket  -> envia comandos JSON, espera ACK (tcp://127.0.0.1:<puerto>)
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
    this._req.linger = 0; // no bloquear el cierre esperando mensajes sin entregar
    this._sub = new Subscriber();
    this._sub.linger = 0;
    this._connected = false;
    this._running = false;
    // Cola de envíos: el socket REQ de ZeroMQ exige un ciclo send→receive por
    // vez. Sin serializar, dos comandos concurrentes (p. ej. reejecutar o
    // cambiar de algoritmo a medio correr) chocan con "Socket is busy writing".
    this._sendQueue = Promise.resolve();
  }

  async connect() {
    // ZeroMQ reconecta automáticamente a estos endpoints si el motor se reinicia.
    this._req.connect(this._cmdEndpoint);
    this._sub.connect(this._streamEndpoint);
    this._sub.subscribe(STREAM_TOPIC);
    this._connected = true;
    this._running = true;
    // No anunciamos "online" aquí: connect() de ZeroMQ es optimista y tiene
    // éxito aunque no haya ningún motor escuchando. El estado real lo decide un
    // PING (ver setupBridge), para no mostrar "motor online" en falso.
    this._startSubscribeLoop(); // no await: corre en segundo plano
  }

  // ¿Hay un motor que responde? Un PING con el timeout normal; true si ACK.
  async ping() {
    try {
      await this.sendCommand({ type: 'PING' });
      return true;
    } catch {
      return false;
    }
  }

  // Envia un comando (objeto) como JSON por REQ y espera el ACK JSON.
  // Se encola tras el comando anterior para respetar el ciclo estricto
  // send→receive del socket REQ (evita "Socket is busy writing").
  async sendCommand(cmd) {
    if (!this._connected) throw new Error('bridge not connected');
    const result = this._sendQueue.then(() => this._sendNow(cmd));
    // La cadena sigue viva aunque este comando falle o expire.
    this._sendQueue = result.catch(() => {});
    return result;
  }

  async _sendNow(cmd) {
    try {
      await this._req.send(JSON.stringify(cmd));
      const [reply] = await this._req.receive();
      return JSON.parse(reply.toString());
    } catch (err) {
      // Un socket REQ que envió pero no recibió (timeout, motor caído/reiniciado)
      // queda en estado inválido y bloquea TODOS los comandos siguientes. Lo
      // recreamos para que el próximo comando vuelva a funcionar.
      this._resetReqSocket();
      throw err;
    }
  }

  // Recrea el socket REQ conservando el endpoint (recuperación ante fallos).
  _resetReqSocket() {
    try {
      this._req.close();
    } catch {}
    this._req = new Request();
    this._req.receiveTimeout = 5000;
    this._req.linger = 0;
    try {
      if (this._connected) this._req.connect(this._cmdEndpoint);
    } catch {}
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
    } catch {}
    try {
      this._req.close();
    } catch {}
    this.emit('status', { connected: false });
  }
}

module.exports = { QuantumBridge, DEFAULT_CMD, DEFAULT_STREAM };
