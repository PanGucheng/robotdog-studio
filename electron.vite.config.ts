import { createServer } from 'node:net'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

async function findAvailablePort(startPort = 5173): Promise<number> {
  return new Promise((resolvePort) => {
    const test = (port: number): void => {
      const server = createServer()
      server.unref()
      server.on('error', () => {
        test(port + 1)
      })
      server.listen(port, '127.0.0.1', () => {
        server.close(() => {
          resolvePort(port)
        })
      })
    }
    test(startPort)
  })
}

const port = await findAvailablePort(Number(process.env.PORT) || 5173)

export default defineConfig({
    main: {
      plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
      build: {
        rollupOptions: {
          external: ['electron'],
          output: {
            format: 'cjs',
            entryFileNames: '[name].cjs'
          }
        }
      },
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          external: ['electron'],
          output: {
            format: 'cjs',
            entryFileNames: '[name].cjs'
          }
        }
      },
      resolve: {
        alias: {
          '@shared': resolve('src/shared')
        }
      }
    },
    renderer: {
      server: {
        host: '127.0.0.1',
        port
      },
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react()]
    }
})
