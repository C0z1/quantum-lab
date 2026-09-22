#include <gtest/gtest.h>
#include "grover.h"
#include <cmath>

// Helper: ejecuta Grover y devuelve el estado final (capturando el ultimo frame).
static QuantumStateVector runGroverFinal(int n, int target, int iters) {
    QuantumStateVector last(n);
    grover::run(n, target, iters,
                [&](int /*it*/, bool /*final*/, const QuantumStateVector& sv) { last = sv; });
    return last;
}

// Valor exacto en forma cerrada: P(target) = sin^2((2k+1) * theta),
// con sin(theta) = 1/sqrt(N), N = 2^n. Sirve de referencia analitica.
static double closedForm(int n, int k) {
    const double N = std::pow(2.0, n);
    const double theta = std::asin(1.0 / std::sqrt(N));
    const double s = std::sin((2 * k + 1) * theta);
    return s * s;
}

// --- Golden values §9 ---

// NOTA sobre n=1: la tabla del spec indica 1.0, pero Grover estandar es
// degenerado para un solo qubit: P = sin^2(3*45deg) = 0.5 es el maximo
// alcanzable. Implementamos el algoritmo matematicamente correcto y
// verificamos el valor real (0.5), que coincide con la forma cerrada.
TEST(Grover, N1_Degenerate) {
    auto sv = runGroverFinal(1, 1, 1);
    EXPECT_NEAR(sv.probabilities()(1), 0.5, 1e-9);
    EXPECT_NEAR(sv.probabilities()(1), closedForm(1, 1), 1e-9);
    EXPECT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
}

TEST(Grover, N2_ExactAmplification) {
    // n=2, target=3, 1 iteracion -> 1.0 exacto (caso especial N=4).
    auto sv = runGroverFinal(2, 3, 1);
    EXPECT_NEAR(sv.probabilities()(3), 1.0, 1e-9);
    EXPECT_NEAR(sv.probabilities()(3), closedForm(2, 1), 1e-9);
    EXPECT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
}

TEST(Grover, N3_Target5_TwoIterations) {
    // Golden: ~0.945 ; spec §5 exige > 0.7.
    auto sv = runGroverFinal(3, 5, 2);
    const double p = sv.probabilities()(5);
    EXPECT_GT(p, 0.7);
    EXPECT_NEAR(p, 0.945, 1e-3);
    EXPECT_NEAR(p, closedForm(3, 2), 1e-9);
    EXPECT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
}

TEST(Grover, N4_Target7_ThreeIterations) {
    // Golden: ~0.961
    auto sv = runGroverFinal(4, 7, 3);
    const double p = sv.probabilities()(7);
    EXPECT_NEAR(p, 0.961, 1e-3);
    EXPECT_NEAR(p, closedForm(4, 3), 1e-9);
    EXPECT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
}

TEST(Grover, OptimalIterationsMatchesTheory) {
    // Para n=10 (N=1024) el optimo teorico es floor(pi/4 * 32) = 25.
    EXPECT_EQ(grover::optimalIterations(10), 25);
}

TEST(Grover, NormPreservedEveryFrame) {
    // El invariante cuantico debe mantenerse en TODOS los frames intermedios.
    grover::run(4, 7, 3, [](int, bool, const QuantumStateVector& sv) {
        ASSERT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
    });
}

TEST(Grover, TargetBecomesMostProbable) {
    // Tras Grover, el estado objetivo debe ser el mas probable.
    auto sv = runGroverFinal(5, 21, grover::optimalIterations(5));
    int argmax = 0;
    sv.probabilities().maxCoeff(&argmax);
    EXPECT_EQ(argmax, 21);
}
