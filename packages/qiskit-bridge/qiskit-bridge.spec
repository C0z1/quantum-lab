# PyInstaller spec — empaqueta el bridge de Qiskit (main.py + algorithms) en un
# ejecutable independiente "qiskit-bridge", para incluir la validación en el
# instalador sin requerir Python en la máquina del usuario.
#
#   Uso:  pyinstaller qiskit-bridge.spec --noconfirm
#   Salida: dist/qiskit-bridge/qiskit-bridge(.exe)   (modo onedir)
#
# Nota: Qiskit + Aer son pesados (~cientos de MB). Este empaquetado es OPCIONAL;
# la app funciona sin él (la validación queda deshabilitada si no está presente).
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []
for pkg in ("qiskit", "qiskit_aer", "numpy", "msgpack", "zmq"):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hiddenimports += h

hiddenimports += [
    "algorithms.grover", "algorithms.shor", "algorithms.teleportation",
]

a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="qiskit-bridge",
          console=True, disable_windowed_traceback=False)
coll = COLLECT(exe, a.binaries, a.datas, name="qiskit-bridge")
