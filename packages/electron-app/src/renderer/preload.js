// preload.js — unico canal entre Main y Renderer (§8). Expone quantumAPI.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quantumAPI', {
  // Comandos al motor
  runGrover: (params) => ipcRenderer.invoke('quantum:run-grover', params),
  runShor: (params) => ipcRenderer.invoke('quantum:run-shor', params),
  runTeleportation: (params) => ipcRenderer.invoke('quantum:run-teleportation', params),
  stopExecution: () => ipcRenderer.invoke('quantum:stop'),

  // Suscripcion a frames del vector de estado
  onStateUpdate: (cb) => ipcRenderer.on('quantum:state-update', (_e, frame) => cb(frame)),
  onEngineStatus: (cb) => ipcRenderer.on('quantum:engine-status', (_e, s) => cb(s)),
  onEngineLog: (cb) => ipcRenderer.on('quantum:engine-log', (_e, x) => cb(x)),

  // Limpieza de listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
