// ESLint v9+ config for your repo

export default [
  {
    ignores: [
      '.github/workflows/*'
    ],
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        // Add any global variables if needed
      },
    },
    env: {
      browser: true,
      node: true,
      es2021: true
    },
    plugins: {},
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'eqeqeq': 'error',
      'curly': 'error',
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'comma-dangle': ['error', 'always-multiline'],
      'arrow-parens': ['error', 'always'],
      'indent': ['error', 2, { 'SwitchCase': 1 }]
    }
  }
];