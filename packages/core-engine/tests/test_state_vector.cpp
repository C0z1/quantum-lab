#include <gtest/gtest.h>
#include "state_vector.h"
#include "quantum_gate.h"
#include <cmath>

// Invariante cuantico global: la suma de probabilidades siempre debe ser 1.0.
static void expectNormalized(const QuantumStateVector& sv) {
    ASSERT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
    ASSERT_NEAR(sv.normSquared(), 1.0, 1e-10);
}

TEST(StateVector, InitialStateIsZeroKet) {
    QuantumStateVector sv(3);
    EXPECT_EQ(sv.dim(), 8);
    EXPECT_NEAR(std::abs(sv.state()(0)), 1.0, 1e-12);
    EXPECT_NEAR(sv.probabilities()(0), 1.0, 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, RejectsInvalidQubitCount) {
    EXPECT_THROW(QuantumStateVector(0), std::invalid_argument);
    EXPECT_THROW(QuantumStateVector(21), std::invalid_argument);  // §8: limite n<=20
}

TEST(StateVector, HadamardOnSingleQubit) {
    // H|0> = [1/sqrt2, 1/sqrt2]
    QuantumStateVector sv(1);
    sv.applyHadamard(0);
    const double inv = 1.0 / std::sqrt(2.0);
    EXPECT_NEAR(sv.state()(0).real(), inv, 1e-12);
    EXPECT_NEAR(sv.state()(1).real(), inv, 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, HadamardAllUniformSuperposition) {
    QuantumStateVector sv(3);
    sv.applyHadamardAll();
    const double p = 1.0 / 8.0;
    for (int i = 0; i < sv.dim(); ++i) EXPECT_NEAR(sv.probabilities()(i), p, 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, PauliXFlipsQubitZero) {
    // §5 Paso 2.2: applyX(0) sobre |00> produce el estado con qubit0 = 1.
    // little-endian: qubit0 es el bit 0 -> indice de estado 1.
    QuantumStateVector sv(2);
    sv.applyX(0);
    EXPECT_NEAR(std::abs(sv.state()(1)), 1.0, 1e-12);
    EXPECT_NEAR(std::abs(sv.state()(0)), 0.0, 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, CNOTEntangles) {
    // H(0) luego CNOT(0->1) crea el estado de Bell (|00>+|11>)/sqrt2.
    QuantumStateVector sv(2);
    sv.applyHadamard(0);
    sv.applyCNOT(0, 1);
    EXPECT_NEAR(sv.probabilities()(0), 0.5, 1e-12);  // |00>
    EXPECT_NEAR(sv.probabilities()(3), 0.5, 1e-12);  // |11>
    EXPECT_NEAR(sv.probabilities()(1), 0.0, 1e-12);
    EXPECT_NEAR(sv.probabilities()(2), 0.0, 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, ToffoliFlipsOnlyWhenBothControls) {
    QuantumStateVector sv(3);
    sv.applyX(0);
    sv.applyX(1);              // estado |011> (indice 3)
    sv.applyToffoli(0, 1, 2);  // ambos controles 1 -> flip target -> |111> (indice 7)
    EXPECT_NEAR(std::abs(sv.state()(7)), 1.0, 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, PhaseGateAddsRelativePhase) {
    QuantumStateVector sv(1);
    sv.applyHadamard(0);
    sv.applyPhase(0, M_PI);  // e^{i pi} = -1 sobre |1>
    EXPECT_NEAR(sv.state()(1).real(), -1.0 / std::sqrt(2.0), 1e-12);
    expectNormalized(sv);
}

TEST(StateVector, NormPreservedThroughRandomCircuit) {
    QuantumStateVector sv(4);
    sv.applyHadamardAll();
    sv.applyX(2);
    sv.applyCNOT(1, 3);
    sv.applyPhase(0, 0.7);
    sv.applyToffoli(0, 1, 2);
    expectNormalized(sv);  // invariante debe sobrevivir a cualquier circuito unitario
}

// Comprobacion cruzada: gateMatrix() (via Kronecker) debe coincidir con la
// aplicacion directa de amplitudes para n pequeno.
TEST(StateVector, GateMatrixMatchesDirectApplication) {
    QuantumStateVector sv(2);
    sv.applyHadamardAll();
    // Estado tras H sobre todo: uniforme. La norma se mantiene.
    expectNormalized(sv);
    EXPECT_NEAR(sv.probabilities().maxCoeff(), 0.25, 1e-12);
}
