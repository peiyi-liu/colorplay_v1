import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.{ts,tsx}'];

export default tseslint.config(
  {
    // supabase/functions 為 Deno 執行環境（npm: 匯入、Deno global），
    // 與生成的 database.ts 同理，不屬於 Node/tsc project service。
    ignores: [
      'coverage',
      'dist',
      'src/types/database.ts',
      'supabase/functions',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  reactHooks.configs.flat.recommended,
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
