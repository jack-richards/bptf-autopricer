// ESLint v9+ flat config for your repo, integrated with Prettier

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,
  prettier, // Disables ESLint rules that conflict with Prettier
  {
    ignores: ['.github/workflows/*'],
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        // Add more as needed for your repo
      },
    },
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      // ESLint best practices
      'no-unused-vars': 'warn',
      'no-console': 'off',
      eqeqeq: 'error',
      curly: 'error',

      // Style rules (aligned with your Prettier config)
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      'comma-dangle': ['error', 'es5'], // match your Prettier trailingComma
      'arrow-parens': ['error', 'always'],
      indent: ['error', 2, { SwitchCase: 1 }],

      // Prettier integration
      'prettier/prettier': 'error', // Show Prettier issues as ESLint errors
    },
  },
];
