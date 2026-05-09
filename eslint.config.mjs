// ESLint flat config — required by ESLint 10.x.
// Mirrors the rules ObsidianReviewBot enforces on every community-plugin
// submission PR. See:
//   context-v/plans/2026-05-03_Assuring-Obsidian-Community-Plugin-Requirements.md
//   ../../context-v/reminders/Obsidian-Marketplace-Compliance.md

import tsParser from '@typescript-eslint/parser';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
    {
        // Project-wide ignores. Build outputs, build tooling, and node_modules.
        ignores: [
            'node_modules/**',
            'main.js',
            'styles.css',
            'esbuild.config.mjs',
            'version-bump.mjs',
            'setup-plugin.mjs',
            'scripts/**',
            'eslint.config.mjs',
        ],
    },
    // Obsidian community-plugin rules — mirrors what ObsidianReviewBot
    // enforces server-side at submission time.
    ...obsidianmd.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
            // Brand allowlist for sentence-case so legitimate proper nouns
            // (Recraft, Magnific, Ideogram, ImageKit, …) aren't lowercased.
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    brands: [
                        'Recraft', 'Magnific', 'Freepik', 'Ideogram', 'ImageKit',
                        'Imgur', 'Anthropic', 'Claude', 'OpenAI', 'Obsidian',
                        'WebP', 'JSON', 'YAML', 'URL', 'API', 'CDN',
                    ],
                    acronyms: ['AI', 'ID', 'URL', 'API', 'JSON', 'YAML', 'CDN', 'HTTP', 'HTTPS'],
                    allowAutoFix: true,
                },
            ],
        },
    },
];
