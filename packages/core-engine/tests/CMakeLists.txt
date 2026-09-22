find_package(GTest REQUIRED)
include(GoogleTest)

add_executable(quantum_tests
    test_state_vector.cpp
    test_grover.cpp
    test_algorithms.cpp
    test_basic_algos.cpp
)
target_link_libraries(quantum_tests PRIVATE quantum_core GTest::gtest GTest::gtest_main)
# Nota: las flags -O3 -march=native se heredan globalmente (add_compile_options)
# para mantener alineacion de Eigen consistente con quantum_core.

gtest_discover_tests(quantum_tests)
