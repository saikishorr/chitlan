import globals from 'globals';

const browserGlobals = {
  ...globals.browser,
  Peer: 'readonly',
  qrcode: 'readonly'
};

export default [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals
    },
    rules: {
      'no-undef': 'error'
    }
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Peer: 'readonly',
        qrcode: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error'
    }
  }
];
     
