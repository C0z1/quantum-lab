// Flat config de ESLint. Reglas recomendadas + globals de Node (main) y browser
// (renderer). Se ejecuta como aviso (no bloquea el release).
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'engine-bin/**', 'py-bin/**'] },
  js.configs.recommended,
  {
    files: ['src/main/**/*.js', 'test-bridge.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, THREE: 'readonly' },
    },
  },
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
