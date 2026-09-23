#include "shor.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>

namespace shor {

// Multiplicacion modular portable: usa enteros de 128 bits en GCC/Clang y cae a
// 64 bits en MSVC (que no tiene __uint128_t). Exacta mientras a,b < 2^32, lo que
// se cumple de sobra para las N pequenas de esta app.
static inline uint64_t mulmod(uint64_t a, uint64_t b, uint64_t m) {
#if defined(__SIZEOF_INT128__)
    return static_cast<uint64_t>((unsigned __int128)a * b % m);
#else
    return a * b % m;
#endif
}

uint64_t gcd(uint64_t x, uint64_t y) {
    while (y) {
        uint64_t t = x % y;
        x = y;
        y = t;
    }
    return x;
}

uint64_t powmod(uint64_t base, uint64_t exp, uint64_t mod) {
    uint64_t result = 1 % mod;
    base %= mod;
    while (exp) {
        if (exp & 1) result = mulmod(result, base, mod);
        base = mulmod(base, base, mod);
        exp >>= 1;
    }
    return result;
}

uint64_t classicalOrder(uint64_t a, uint64_t N) {
    if (gcd(a, N) != 1) return 0;
    uint64_t r = 1, cur = a % N;
    while (cur != 1) {
        cur = mulmod(cur, a, N);
        ++r;
        if (r > N) return 0;  // salvaguarda
    }
    return r;
}

int countingQubits(uint64_t N) {
    int n = 0;
    while ((uint64_t(1) << n) < N) ++n;  // ceil(log2 N)
    return 2 * n;
}

// Inversa de la QFT sobre el registro de conteo [start, start+t).
// Convencion: qubit `start` es el bit menos significativo del entero medido.
static void inverseQFT(QuantumStateVector& sv, int start, int t) {
    // Invertir el orden de bits.
    for (int i = 0; i < t / 2; ++i) sv.applySwap(start + i, start + t - 1 - i);
    for (int j = 0; j < t; ++j) {
        for (int k = 0; k < j; ++k) {
            const double angle = -M_PI / std::pow(2.0, j - k);
            sv.applyCPhase(start + k, start + j, angle);
        }
        sv.applyHadamard(start + j);
    }
}

// Fracciones continuas: mejor r <= N con |m/M - s/r| pequeno. Devuelve el
// denominador de la convergente cuyo r verifica a^r = 1 mod N, o 0.
static uint64_t orderFromPhase(uint64_t m, uint64_t M, uint64_t a, uint64_t N) {
    if (m == 0) return 0;
    // Expansion en fraccion continua de m/M.
    uint64_t num = m, den = M;
    uint64_t h_prev = 0, h_cur = 1;  // numeradores convergentes
    uint64_t k_prev = 1, k_cur = 0;  // denominadores convergentes
    while (den != 0) {
        uint64_t q = num / den;
        uint64_t h_next = q * h_cur + h_prev;
        uint64_t k_next = q * k_cur + k_prev;
        // k_next es un candidato a r.
        if (k_next > 0 && k_next <= N && powmod(a, k_next, N) == 1) return k_next;
        h_prev = h_cur;
        h_cur = h_next;
        k_prev = k_cur;
        k_cur = k_next;
        uint64_t r = num % den;
        num = den;
        den = r;
        if (k_cur > N) break;
    }
    return 0;
}

Result run(uint64_t N, uint64_t a, const FrameCallback& on_frame) {
    Result res;
    res.N = N;
    res.a = a;
    if (N < 3 || a < 2 || a >= N) throw std::invalid_argument("Shor: 2 <= a < N, N >= 3");

    // Caso trivial: a comparte factor con N.
    uint64_t g = gcd(a, N);
    if (g != 1) {
        res.order = 0;
        res.factors = {g, N / g};
        res.success = true;
        on_frame(0, true, Eigen::VectorXd::Zero(1));
        return res;
    }

    const int nw = static_cast<int>(countingQubits(N) / 2);  // ceil(log2 N)
    const int t = countingQubits(N);                         // registro de conteo
    res.counting_qubits = t;
    res.work_qubits = nw;

    if (t + nw > 20) throw std::invalid_argument("Shor: N demasiado grande (>20 qubits)");

    // Layout: work [0, nw), counting [nw, nw+t).
    const int work_start = 0;
    const int count_start = nw;
    QuantumStateVector sv(t + nw);

    // Registro de trabajo inicializado a |1>.
    sv.applyX(work_start);
    // Superposicion en el registro de conteo.
    for (int j = 0; j < t; ++j) sv.applyHadamard(count_start + j);
    on_frame(0, false, sv.marginalProbabilities(count_start, t));

    // QPE: controlled-U^(2^j), con U|y> = |a*y mod N>.
    for (int j = 0; j < t; ++j) {
        const uint64_t mult = powmod(a, uint64_t(1) << j, N);  // a^(2^j) mod N
        sv.applyControlledModMul(count_start + j, work_start, nw, mult, N);
    }
    // QFT inversa sobre el registro de conteo.
    inverseQFT(sv, count_start, t);

    const Eigen::VectorXd counting = sv.marginalProbabilities(count_start, t);
    on_frame(1, true, counting);

    // Post-proceso: examinar los picos mas probables.
    const uint64_t M = uint64_t(1) << t;
    std::vector<int> idx(counting.size());
    for (int i = 0; i < counting.size(); ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(), [&](int p, int q) { return counting(p) > counting(q); });

    uint64_t r = 0;
    for (int rank = 0; rank < std::min<int>(8, idx.size()); ++rank) {
        uint64_t cand = orderFromPhase(idx[rank], M, a, N);
        if (cand) {
            r = cand;
            break;
        }
    }
    if (r == 0) {
        res.success = false;
        return res;
    }
    res.order = r;

    // Factores a partir del periodo: r par y a^{r/2} != -1 mod N.
    if (r % 2 == 0) {
        uint64_t x = powmod(a, r / 2, N);
        if (x != N - 1) {
            uint64_t f1 = gcd(x + 1, N);
            uint64_t f2 = gcd(x + N - 1, N);
            std::vector<uint64_t> fs;
            for (uint64_t f : {f1, f2})
                if (f != 1 && f != N) fs.push_back(f);
            if (!fs.empty()) {
                std::sort(fs.begin(), fs.end());
                fs.erase(std::unique(fs.begin(), fs.end()), fs.end());
                res.factors = fs;
                res.success = true;
            }
        }
    }
    return res;
}

}  // namespace shor
