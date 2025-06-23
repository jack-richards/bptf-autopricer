const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const eslintPluginPrettier = require('eslint-plugin-prettier');
const eslintPluginSpellcheck = require('eslint-plugin-spellcheck'); // <-- add this

module.exports = [
  js.configs.recommended,
  prettier,
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
        setTimeout: 'readonly',
        setInterval: 'readonly',
      },
    },
    plugins: {
      prettier: eslintPluginPrettier,
      spellcheck: eslintPluginSpellcheck,
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      eqeqeq: 'error',
      curly: 'error',
      'prettier/prettier': 'error',
      'spellcheck/spell-checker': [
        1,
        {
          comments: true,
          strings: true,
          identifiers: false,
          lang: 'en_US',
          skipWords: [
            'bptf',
            'sku',
            'autopricer',
            'tf2',
            'steamid',
            'defindex',
            'pricelist',
            'Autobot',
            'polldata',
            'skus',
            'keyobj',
            'fs',
            'utf8',
          ],
        },
      ],
    },
  },
];
