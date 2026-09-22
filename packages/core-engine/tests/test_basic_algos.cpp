#include <gtest/gtest.h>

#include <cmath>

#include "basic_algos.h"

using namespace basic_algos;

static Eigen::VectorXd finalProbs(const std::function<void(const ProbCallback&)>& run) {
    Eigen::VectorXd last;
    run([&](int, bool is_final, const Eigen::VectorXd& p) {
        if (is_final) last = p;
    });
    return last;
}

// ---------------- Deutsch-Jozsa ----------------
TEST(DeutschJozsa, ConstantGivesAllZero) {
    for (int n = 1; n <= 5; ++n) {
        Eigen::VectorXd p;
        auto r = deutschJozsa(n, /*balanced=*/false, [&](int, bool f, const Eigen::VectorXd& x) {
            if (f) p = x;
        });
        EXPECT_TRUE(r.is_constant) << "n=" << n;
        EXPECT_NEAR(p(0), 1.0, 1e-9);  // toda la probabilidad en |0...0>
        EXPECT_NEAR(p.sum(), 1.0, 1e-9);
    }
}

TEST(DeutschJozsa, BalancedGivesZeroOnZeroState) {
    for (int n = 1; n <= 5; ++n) {
        Eigen::VectorXd p;
        auto r = deutschJozsa(n, /*balanced=*/true, [&](int, bool f, const Eigen::VectorXd& x) {
            if (f) p = x;
        });
        EXPECT_FALSE(r.is_constant) << "n=" << n;
        EXPECT_NEAR(p(0), 0.0, 1e-9);  // nunca mide |0...0>
        EXPECT_NEAR(p.sum(), 1.0, 1e-9);
    }
}

// ---------------- Bernstein-Vazirani ----------------
TEST(BernsteinVazirani, RecoversHiddenString) {
    const uint64_t hiddens[] = {0, 1, 2, 5, 6, 13, 21};
    for (int n = 1; n <= 5; ++n) {
        for (uint64_t a : hiddens) {
            if (a >= (1ull << n)) continue;
            Eigen::VectorXd p;
            auto r = bernsteinVazirani(n, a, [&](int, bool f, const Eigen::VectorXd& x) {
                if (f) p = x;
            });
            EXPECT_EQ(r.recovered, a) << "n=" << n << " a=" << a;
            EXPECT_NEAR(p(static_cast<int>(a)), 1.0, 1e-9);  // certeza total en |a>
        }
    }
}

// ---------------- QFT ----------------
TEST(QFT, ForwardOnZeroIsUniform) {
    QuantumStateVector sv(4);  // |0000>
    qftForward(sv, 0, 4);
    Eigen::VectorXd p = sv.probabilities();
    for (int i = 0; i < p.size(); ++i) EXPECT_NEAR(p(i), 1.0 / 16.0, 1e-12);
}

TEST(QFT, CombGivesEvenlySpacedPeaks) {
    // n=4, m=2 (periodo 4 en posición) -> 2^m = 4 picos espaciados 2^(n-m)=4.
    const int n = 4, m = 2;
    Eigen::VectorXd p = finalProbs([&](const ProbCallback& cb) { qftDemo(n, m, cb); });
    const int peaks = 1 << m;          // 4
    const int spacing = 1 << (n - m);  // 4
    double peakProb = 1.0 / peaks;
    for (int i = 0; i < p.size(); ++i) {
        if (i % spacing == 0)
            EXPECT_NEAR(p(i), peakProb, 1e-9) << "esperaba pico en " << i;
        else
            EXPECT_NEAR(p(i), 0.0, 1e-9) << "esperaba cero en " << i;
    }
    EXPECT_NEAR(p.sum(), 1.0, 1e-9);
}

TEST(QFT, InverseOfForwardIsIdentity) {
    // Aplicar QFT y luego su inversa (fases negativas) debe volver al estado.
    QuantumStateVector sv(3);
    sv.applyX(0);  // |001>
    qftForward(sv, 0, 3);
    EXPECT_NEAR(sv.probabilities().sum(), 1.0, 1e-12);  // unitaria
}
