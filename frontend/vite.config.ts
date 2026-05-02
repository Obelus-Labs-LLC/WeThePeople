import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load env from project root (one level up) so we pick up WTP_API_URL from ../.env
  const env = loadEnv(mode, '..', 'WTP_')
  const apiTarget = env.WTP_API_URL || 'https://api.wethepeopleforus.com'

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        // plotly.js (or one of its transitive deps) emits a side-effect
        // `import "buffer/"` (with trailing slash) into the bundle.
        // The browser refuses the bare specifier and the React app
        // never mounts.
        //
        // Use a regex alias so we ONLY intercept the bare `buffer/`
        // specifier, NOT legitimate package imports of `buffer` (which
        // recharts-internal helpers do use, and which need their real
        // module — aliasing the no-slash form to an empty file
        // produced "Cannot read properties of undefined (reading
        // 'forwardRef')" because some recharts internal couldn't load).
        //
        // ^buffer/$ matches exactly the bare `buffer/` specifier, no
        // more no less. Nothing else is intercepted.
        { find: /^buffer\/$/, replacement: path.resolve(__dirname, './src/shims/empty-buffer.ts') },
      ],
    },
    build: {
      minify: 'esbuild',
      // Vendor chunk is now ~4-5 MB minified because everything in
      // node_modules ships in one chunk (see comment below). Bump the
      // warning so the build log doesn't yell about an intentional
      // choice.
      chunkSizeWarningLimit: 6000,

      // NO manualChunks. Three custom-split iterations on 2026-05-02
      // each produced a different vendor↔split-chunk ESM cycle and a
      // black-screen outage:
      //
      //   iter 1 (PR #84): aliased both `buffer/` and `buffer` to an
      //                    empty shim. recharts couldn't read its
      //                    legitimate `buffer` import and surfaced
      //                    `Cannot read properties of undefined
      //                    (reading 'forwardRef')` from the `charts`
      //                    chunk.
      //   iter 2 (PR #87): collapsed recharts/d3/framer-motion/@tanstack
      //                    into vendor; kept plotly split.
      //                    `id.includes('plotly')` also matched the
      //                    separate npm package `@plotly/d3` (used by
      //                    vendor libs), creating a vendor↔plotly
      //                    cycle. plotly.js then read `Promise` off
      //                    an undefined binding.
      //   iter 3 (PR #89): precise leaf-package matching for
      //                    plotly/graph/map. The `map` chunk hit the
      //                    same cycle pattern through react-leaflet's
      //                    `React.forwardRef` call.
      //
      // Shared root cause: any split chunk eventually gets imported
      // back from vendor through some transitive npm dep we don't
      // control, and ESM cycle init order leaves one side's exports
      // `undefined` when the other reads them. Until we have time to
      // audit each library's full import graph, Vite's default
      // chunking (everything in node_modules in one vendor chunk) is
      // the only safe choice. Bigger first paint, but the SPA mounts.
    },
    esbuild: {
      drop: ['console', 'debugger'],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
