import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

/**
 * Vite dev-mode WebSocket plugin.
 * Uses jiti to load server/wsHooks.ts (TypeScript) at runtime,
 * then attaches a crossws node adapter to the Vite HTTP server's
 * upgrade event so /api/ws works during `vite dev`.
 * In production, Nitro handles this route natively.
 */
function wsDevPlugin(): Plugin {
  return {
    name: 'ws-dev',
    apply: 'serve',
    async configureServer(server) {
      const { default: nodeAdapter } = await import('crossws/adapters/node')

      // jiti handles TypeScript imports without needing tsc
      const jiti = createJiti(fileURLToPath(import.meta.url), {
        interopDefault: true,
      })

      const { wsHooks } = jiti('./server/wsHooks') as {
        wsHooks: Parameters<typeof nodeAdapter>[0]['hooks']
      }

      const adapter = nodeAdapter({ hooks: wsHooks })

      server.httpServer?.on(
        'upgrade',
        async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
          const url = new URL(request.url ?? '/', 'http://localhost')
          if (url.pathname !== '/api/ws') return
          try {
            await adapter.handleUpgrade(request, socket, head)
          } catch (err) {
            console.error('[ws-dev] upgrade error:', err)
            socket.destroy()
          }
        },
      )
    },
  }
}

export default defineConfig({
  plugins: [
    wsDevPlugin(),
    nitro({ serverDir: 'server', experimental: { websocket: true } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
