# Conceptos cuánticos — Glosario pedagógico

Glosario para la UI, dirigido a personas **sin conocimientos previos**. Cada
entrada mantiene rigor técnico pero empieza con una intuición.

## Qubit
La unidad de información cuántica. A diferencia de un bit (0 ó 1), un qubit
puede estar en una **superposición**: una mezcla de 0 y 1 a la vez, descrita por
dos números complejos (amplitudes) α y β con |α|² + |β|² = 1.

## Vector de estado
La descripción completa de un sistema de *n* qubits: una lista de 2ⁿ amplitudes
complejas. Para 3 qubits hay 8 amplitudes, una por cada resultado posible
(|000⟩, |001⟩, …, |111⟩). En Quantum Lab, cada barra 3D representa una de esas
amplitudes.

## Amplitud y probabilidad
Cada amplitud es un número complejo. La **probabilidad** de medir ese estado es
el módulo al cuadrado, |α|² = re² + im². La suma de todas las probabilidades es
siempre 1 (el **invariante cuántico** que verificamos en cada test).

## Superposición uniforme
Tras aplicar una puerta Hadamard a todos los qubits, todos los estados tienen la
misma amplitud. Con 3 qubits, cada uno tiene probabilidad 1/8 = 12.5 %. Es el
punto de partida de Grover: "no sé nada, todo es igual de probable".

## Puerta de Hadamard (H)
Crea superposición. Convierte |0⟩ en una mezcla igual de |0⟩ y |1⟩. Es la puerta
que "reparte" la probabilidad.

## Puerta X (NOT)
El equivalente cuántico del NOT clásico: intercambia las amplitudes de |0⟩ y |1⟩.

## CNOT y Toffoli
Puertas controladas: cambian un qubit *objetivo* solo si los qubits de *control*
valen 1. Son la base del entrelazamiento (p. ej. el estado de Bell) y de los
oráculos multi-qubit.

## Fase
Una amplitud compleja tiene magnitud y **fase** (un ángulo). La fase no cambia la
probabilidad por sí sola, pero al interferir con otras amplitudes decide qué
estados se refuerzan y cuáles se cancelan. Grover explota exactamente esto.

## Algoritmo de Grover
Busca un elemento marcado dentro de N = 2ⁿ posibilidades en ~√N pasos, frente a
los ~N/2 de una búsqueda clásica. Cada iteración tiene dos partes:

1. **Oráculo**: marca el estado buscado invirtiendo su fase (lo multiplica por
   −1). Visualmente, esa barra "se voltea".
2. **Difusor** (inversión sobre la media): refleja todas las amplitudes respecto
   a su promedio. El estado marcado, que quedó por debajo, rebota por encima y
   **crece**; los demás encogen.

Repetido el número óptimo de veces (~⌊π/4·√N⌋), la barra del objetivo domina.

### Sobre-rotación
Grover no mejora indefinidamente: si se hacen demasiadas iteraciones, la
probabilidad del objetivo vuelve a bajar (la amplitud "se pasa de largo"). Por
eso 0 iteraciones = usar el óptimo, y explorar valores mayores muestra el
fenómeno.

### Valores de referencia
| n | objetivo | iteraciones | prob(objetivo) |
|---|---|---|---|
| 2 | 3 | 1 | 1.000 (exacto) |
| 3 | 5 | 2 | 0.945 |
| 4 | 7 | 3 | 0.961 |

> **Nota sobre 1 qubit:** con un solo qubit Grover es degenerado — el máximo
> alcanzable es 0.5, no 1.0. Es una peculiaridad matemática del caso N=2, no un
> error: se necesita más de un estado "no marcado" para que la reflexión sobre la
> media amplifique el objetivo.

## Teletransportación cuántica
No mueve materia: transfiere el **estado** |ψ⟩ de un qubit a otro distante usando
un par entrelazado (Bell) y dos bits clásicos. Alice enreda su qubit con |ψ⟩,
mide, y envía el resultado a Bob, que aplica correcciones X/Z para reconstruir
|ψ⟩. El original se destruye (teorema de no-clonación). En Quantum Lab se ve como
tres esferas de Bloch: el vector del qubit destino termina idéntico al del qubit
fuente (fidelidad 1). Se usa "medición diferida": las correcciones son puertas
controladas, de modo que todo el protocolo es un circuito reversible.

## Algoritmo de Shor
Factoriza un número N en tiempo polinómico, algo que ninguna computadora clásica
sabe hacer eficientemente (la seguridad de RSA depende de ello). El truco: factorizar
se reduce a hallar el **periodo** r de la función a^x mod N, y ese periodo se
encuentra con **estimación de fase cuántica** (QPE) sobre la transformada de Fourier
cuántica. La QPE produce picos en s/r; las **fracciones continuas** recuperan r, y
de ahí los factores como gcd(a^{r/2} ± 1, N). En Quantum Lab el histograma del
registro de conteo muestra esos picos equiespaciados (s/r) y el panel reporta el
periodo y los factores.

## Esfera de Bloch
Una forma de dibujar el estado de **un** qubit como un punto sobre una esfera.
Útil para n ≤ 3 qubits; para más qubits el espacio es demasiado grande para una
sola esfera y se usan las barras de probabilidad.
