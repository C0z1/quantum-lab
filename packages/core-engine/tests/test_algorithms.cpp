#include <gtest/gtest.h>
#include "teleportation.h"
#include "shor.h"
#include <cmath>

// ---------------- Teletransportacion ----------------

TEST(Teleportation, RecoversStateFidelityOne) {
    // Varios estados |psi>; el destino debe recuperarlos con fidelidad 1.
    const double cases[][2] = {{0.0, 0.0}, {M_PI / 2, 0.0}, {M_PI / 2, M_PI / 2},
                               {1.1, 0.7}, {2.3, -1.4},     {M_PI, 0.0}};
    for (auto& c : cases) {
        auto r = teleport::run(c[0], c[1], [](int, bool, const QuantumStateVector&) {});
        EXPECT_NEAR(r.fidelity, 1.0, 1e-9) << "theta=" << c[0] << " phi=" << c[1];
    }
}

TEST(Teleportation, NormPreservedEveryStep) {
    teleport::run(1.1, 0.7, [](int, bool, const QuantumStateVector& sv) {
        ASSERT_NEAR(sv.probabilities().sum(), 1.0, 1e-10);
    });
}

TEST(Teleportation, DestBlochMatchesSource) {
    auto r = teleport::run(1.9, 0.3, [](int, bool, const QuantumStateVector&) {});
    EXPECT_NEAR(r.dest_bloch.x(), r.source_bloch.x(), 1e-9);
    EXPECT_NEAR(r.dest_bloch.y(), r.source_bloch.y(), 1e-9);
    EXPECT_NEAR(r.dest_bloch.z(), r.source_bloch.z(), 1e-9);
}

// ---------------- Shor ----------------

TEST(ShorClassical, PowmodAndOrder) {
    EXPECT_EQ(shor::powmod(7, 4, 15), 1u);
    EXPECT_EQ(shor::classicalOrder(7, 15), 4u);
    EXPECT_EQ(shor::classicalOrder(2, 15), 4u);
    EXPECT_EQ(shor::classicalOrder(4, 21), 3u);  // 4^3=64=1 mod21
}

TEST(Shor, Factor15) {
    auto r = shor::run(15, 7, [](int, bool, const Eigen::VectorXd&) {});
    ASSERT_TRUE(r.success);
    EXPECT_EQ(r.order, 4u);
    // 15 = 3 * 5
    ASSERT_FALSE(r.factors.empty());
    bool has3 = false, has5 = false;
    for (auto f : r.factors) {
        if (f == 3) has3 = true;
        if (f == 5) has5 = true;
    }
    EXPECT_TRUE(has3 && has5);
    for (auto f : r.factors) EXPECT_EQ(15u % f, 0u);
}

TEST(Shor, Factor21) {
    auto r = shor::run(21, 2, [](int, bool, const Eigen::VectorXd&) {});
    ASSERT_TRUE(r.success);
    // 2 tiene orden 6 mod 21; factores 3 y 7.
    EXPECT_EQ(r.order, 6u);
    for (auto f : r.factors) EXPECT_EQ(21u % f, 0u);
    bool ok = false;
    for (auto f : r.factors)
        if (f == 3 || f == 7) ok = true;
    EXPECT_TRUE(ok);
}

TEST(Shor, TrivialFactorWhenGcdNotOne) {
    auto r = shor::run(15, 6, [](int, bool, const Eigen::VectorXd&) {});  // gcd(6,15)=3
    ASSERT_TRUE(r.success);
    bool has3 = false;
    for (auto f : r.factors)
        if (f == 3) has3 = true;
    EXPECT_TRUE(has3);
}

TEST(Shor, CountingProbabilitiesNormalized) {
    shor::run(15, 7, [](int, bool, const Eigen::VectorXd& probs) {
        if (probs.size() > 1) ASSERT_NEAR(probs.sum(), 1.0, 1e-9);
    });
}
