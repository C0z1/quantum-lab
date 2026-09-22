// Prueba de integracion headless (sin Electron): valida QuantumBridge contra el
// motor C++ real. Verifica REQ/REP (PING/ACK) y SUB (frames MessagePack via msgpackr).
const { QuantumBridge } = require('./src/main/zmq-bridge');

(async () => {
  const bridge = new QuantumBridge();
  const frames = [];
  bridge.on('state-update', (f) => frames.push(f));
  bridge.on('error', (e) => console.error('bridge error', e.message));

  await bridge.connect();
  await new Promise((r) => setTimeout(r, 300)); // subscripcion PUB/SUB

  const ping = await bridge.sendCommand({ type: 'PING' });
  console.log('PING ->', JSON.stringify(ping));
  if (ping.status !== 'PONG') throw new Error('PING fallo');

  const ack = await bridge.sendCommand({
    type: 'RUN_GROVER', n_qubits: 3, target_state: 5,
    iterations: 2, stream_intermediate: true,
  });
  console.log('RUN_GROVER ->', JSON.stringify(ack));

  await new Promise((r) => setTimeout(r, 800)); // recibir frames

  console.log(`frames recibidos: ${frames.length}`);
  for (const f of frames) {
    const probTarget = f.data[3 * 5 + 2];
    console.log(`  it=${f.iteration} final=${f.isFinal} size=${f.stateSize} ` +
                `dataType=${f.data.constructor.name} prob[5]=${probTarget.toFixed(6)}`);
  }
  const final = frames.filter((f) => f.isFinal).pop();
  if (!final) throw new Error('sin frame final');
  const probT = final.data[3 * 5 + 2];
  if (!(final.data instanceof Float64Array)) throw new Error('data no es Float64Array');
  if (Math.abs(probT - 0.9453125) > 1e-6) throw new Error('prob[5] inesperada: ' + probT);

  await bridge.sendCommand({ type: 'SHUTDOWN' });
  bridge.disconnect();
  console.log('BRIDGE_TEST_OK');
  process.exit(0);
})().catch((e) => { console.error('BRIDGE_TEST_FAIL', e); process.exit(1); });
