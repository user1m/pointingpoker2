import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Run each test file in its own worker process; avoids leftover Vite
    // server handles that prevent clean exit when the full vite.config.ts
    // plugins (TanStack Start, Nitro, Tailwind, …) are loaded.
    pool: 'forks',
  },
})
