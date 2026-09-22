cmake_minimum_required(VERSION 3.20)
project(quantum_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Flags de optimizacion/vectorizacion IDENTICAS en todas las TUs (alineacion de
# Eigen), portables por compilador.
if(MSVC)
    add_compile_options(/O2 /arch:AVX2 /fp:fast /EHsc)
else()
    add_compile_options(-O3 -march=native)
endif()

# --- Dependencias (soporta vcpkg [Windows] y paquetes de sistema [Linux]) ----
find_package(Eigen3 CONFIG QUIET)
find_package(nlohmann_json CONFIG QUIET)
find_package(cppzmq CONFIG QUIET)
find_package(msgpack-cxx CONFIG QUIET)
find_package(ZeroMQ CONFIG QUIET)          # provisto por vcpkg (target libzmq)

if(NOT ZeroMQ_FOUND)                        # Linux: usar pkg-config
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(ZMQ REQUIRED libzmq)
endif()

# Eigen fallback (header-only en /usr/include/eigen3 en Linux)
if(NOT TARGET Eigen3::Eigen)
    find_path(EIGEN3_INCLUDE_DIR Eigen/Dense PATHS /usr/include/eigen3 REQUIRED)
endif()

# --- Biblioteca del motor (solo necesita Eigen) ---------------------------
add_library(quantum_core STATIC
    src/state_vector.cpp
    src/quantum_gate.cpp
    src/grover.cpp
    src/teleportation.cpp
    src/shor.cpp
)
target_include_directories(quantum_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
if(TARGET Eigen3::Eigen)
    target_link_libraries(quantum_core PUBLIC Eigen3::Eigen)
else()
    target_include_directories(quantum_core PUBLIC ${EIGEN3_INCLUDE_DIR})
endif()

find_package(OpenMP QUIET)
if(OpenMP_CXX_FOUND)
    target_link_libraries(quantum_core PUBLIC OpenMP::OpenMP_CXX)
endif()

# --- Ejecutable del motor (ZMQ + msgpack + json) --------------------------
add_executable(quantum-engine src/main.cpp src/zmq_server.cpp)
target_link_libraries(quantum-engine PRIVATE quantum_core)

# ZeroMQ
if(TARGET libzmq)
    target_link_libraries(quantum-engine PRIVATE libzmq)
elseif(TARGET libzmq-static)
    target_link_libraries(quantum-engine PRIVATE libzmq-static)
else()
    target_include_directories(quantum-engine PRIVATE ${ZMQ_INCLUDE_DIRS})
    target_link_libraries(quantum-engine PRIVATE ${ZMQ_LIBRARIES})
endif()
# cppzmq (header-only): en Linux zmq.hpp esta en el include del sistema
if(TARGET cppzmq)
    target_link_libraries(quantum-engine PRIVATE cppzmq)
elseif(TARGET cppzmq-static)
    target_link_libraries(quantum-engine PRIVATE cppzmq-static)
endif()
# msgpack-cxx (header-only)
if(TARGET msgpack-cxx)
    target_link_libraries(quantum-engine PRIVATE msgpack-cxx)
endif()
# nlohmann_json
if(TARGET nlohmann_json::nlohmann_json)
    target_link_libraries(quantum-engine PRIVATE nlohmann_json::nlohmann_json)
endif()

# --- Tests (opcionales: solo si GTest esta disponible) --------------------
enable_testing()
find_package(GTest CONFIG QUIET)
if(NOT TARGET GTest::gtest)
    find_package(GTest QUIET)   # module mode (paquete de sistema en Linux)
endif()
if(TARGET GTest::gtest)
    add_subdirectory(tests)
else()
    message(STATUS "GTest no encontrado; se omiten los tests (el motor se compila igual)")
endif()
