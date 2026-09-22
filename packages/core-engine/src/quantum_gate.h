#pragma once
#include <Eigen/Dense>
#include <complex>

// Matrices canonicas de puertas cuanticas de 1 y 2 qubits.
// El motor principal (state_vector.cpp) aplica las puertas por indexado directo
// de amplitudes por eficiencia; estas matrices se usan para validacion, tests y
// la construccion de operadores completos via gateMatrix().
namespace gates {

using Cd = std::complex<double>;

Eigen::Matrix2cd hadamard();           // H = 1/sqrt2 [[1,1],[1,-1]]
Eigen::Matrix2cd pauliX();             // X = [[0,1],[1,0]]
Eigen::Matrix2cd pauliY();             // Y = [[0,-i],[i,0]]
Eigen::Matrix2cd pauliZ();             // Z = [[1,0],[0,-1]]
Eigen::Matrix2cd phase(double theta);  // R(theta) = [[1,0],[0,e^{i theta}]]
Eigen::Matrix4cd cnot();               // CNOT (control = qubit alto)

}  // namespace gates
