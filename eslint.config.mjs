import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const isolation = [
  {
    group: ['@/server', '@/server/**', '**/server/**'],
    message: 'src/ui is props-only and cannot import the server.',
  },
  {
    group: ['@/features', '@/features/**', '**/features/**'],
    message: 'src/ui cannot import features. Pass data in as props.',
  },
  {
    group: ['@/mocks', '@/mocks/**', '**/mocks/**'],
    message: 'src/ui cannot import mocks. Fixture files may.',
  },
  {
    group: [
      '@tanstack/react-query',
      '@tanstack/react-query/**',
      'zustand',
      'zustand/**',
    ],
    message: 'src/ui cannot fetch or subscribe to a store.',
  },
];

const layers = {
  tokens: ['primitives', 'trading', 'chart', 'patterns'],
  primitives: ['trading', 'chart', 'patterns'],
  trading: ['chart', 'patterns'],
  chart: ['patterns'],
};

function restricted(extra = []) {
  return ['error', { patterns: [...isolation, ...extra] }];
}

function higherLayers(names) {
  return names.flatMap((name) => [
    {
      group: [`@/ui/${name}`, `@/ui/${name}/**`, `**/${name}/**`],
      message: `This UI layer cannot import ${name}.`,
    },
  ]);
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'generated/**',
    'coverage/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['src/ui/**/*.fixtures.ts'],
    rules: {
      'no-restricted-imports': restricted(),
    },
  },
  ...Object.entries(layers).map(([layer, above]) => ({
    files: [`src/ui/${layer}/**/*.{ts,tsx}`],
    ignores: ['src/ui/**/*.fixtures.ts'],
    rules: {
      'no-restricted-imports': restricted(higherLayers(above)),
    },
  })),
  {
    files: [
      'src/server/domain/**/*.ts',
      'src/server/services/**/*.ts',
      'src/worker/**/*.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Use the injected Clock. new Date() is only allowed in adapters.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Use the injected Clock. Date.now() is only allowed in adapters.',
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.fixtures.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: isolation.filter(
            (pattern) => !pattern.group.some((item) => item.includes('mocks')),
          ),
        },
      ],
    },
  },
]);

export default eslintConfig;
