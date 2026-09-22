#include "quantum_gate.h"
#include <cmath>

namespace gates {

static constexpr double INV_SQRT2 = 0.7071067811865475244;

Eigen::Matrix2cd hadamard() {
    Eigen::Matrix2cd H;
    H << Cd(INV_SQRT2, 0), Cd(INV_SQRT2, 0),
         Cd(INV_SQRT2, 0), Cd(-INV_SQRT2, 0);
    return H;
}

Eigen::Matrix2cd pauliX() {
    Eigen::Matrix2cd X;
    X << Cd(0, 0), Cd(1, 0),
         Cd(1, 0), Cd(0, 0);
    return X;
}

Eigen::Matrix2cd pauliY() {
    Eigen::Matrix2cd Y;
    Y << Cd(0, 0), Cd(0, -1),
         Cd(0, 1), Cd(0, 0);
    return Y;
}

Eigen::Matrix2cd pauliZ() {
    Eigen::Matrix2cd Z;
    Z << Cd(1, 0), Cd(0, 0),
         Cd(0, 0), Cd(-1, 0);
    return Z;
}

Eigen::Matrix2cd phase(double theta) {
    Eigen::Matrix2cd R;
    R << Cd(1, 0), Cd(0, 0),
         Cd(0, 0), std::polar(1.0, theta);
    return R;
}

Eigen::Matrix4cd cnot() {
    Eigen::Matrix4cd C = Eigen::Matrix4cd::Identity();
    // Base |c t>: intercambia |10> <-> |11> (control = bit alto).
    C(2, 2) = Cd(0, 0); C(2, 3) = Cd(1, 0);
    C(3, 3) = Cd(0, 0); C(3, 2) = Cd(1, 0);
    return C;
}

} // namespace gates
