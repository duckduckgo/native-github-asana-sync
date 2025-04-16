import ddgConfig from '@duckduckgo/eslint-config';
import globals from 'globals';
export default [
    ...ddgConfig,
    {
        ignores: ['dist'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.jest,
            },
        },
    },
];
