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
      // Charts chunk legitimately exceeds 500 KB (recharts + d3) but
      // is not on any page's critical path. Bump the warning so the
      // build log isn't yelling about expected chunks.
      chunkSizeWarningLimit: 1200,
      // Manual chunk splitting. Without this, Vite's default vendor
      // strategy lumps all of node_modules into a single chunk that
      // every lazy page depends on, so the user has to download the
      // whole 4.9 MB vendor blob (force-graph + leaflet + recharts +
      // d3 + framer-motion + ...) before *any* page can paint.
      //
      // The split below isolates the heavy graphics libs into their
      // own chunks. PersonProfilePage doesn't use force-graph or
      // leaflet, so it no longer pays for them. The libs only load
      // when InfluenceNetworkPage / InfluenceMapPage mount.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            // SPLIT POLICY (post-2026-05-02 black-screen incident,
            // iteration 3):
            //
            // Previous attempt collapsed recharts/d3/framer-motion/
            // @tanstack into vendor and kept plotly/graph/leaflet
            // split. That fixed the recharts→React cycle but the
            // PLOTLY split STILL had a cycle with vendor (cause:
            // `id.includes('plotly')` matched `@plotly/d3`, a
            // separate npm package that recharts and other vendor
            // libs depend on; vendor then had a back-edge into the
            // plotly chunk and plotly's top-level evaluation read
            // `Promise` off an undefined vendor binding ⇒ blank).
            //
            // Fix: match the npm package paths PRECISELY (trailing
            // slash), so the plotly chunk only contains the actual
            // `plotly.js` package and nothing else. `@plotly/d3`
            // falls through to vendor where every other d3 lives.
            //
            // Same precision applied to leaflet and react-force-graph.
            // Anything that doesn't match a leaf rule goes to vendor.
            if (id.includes('node_modules/plotly.js/') ||
                id.includes('node_modules/plotly.js-dist-min/')) {
              return 'plotly';
            }
            // react-force-graph + three.js itself (NOT three-* helpers,
            // some of which are also pulled in by other vendor libs).
            if (id.includes('node_modules/react-force-graph') ||
                id.includes('node_modules/three/')) {
              return 'graph';
            }
            // leaflet + react-leaflet (NOT @react-leaflet sub-packages
            // that vendor libs may share).
            if (id.includes('node_modules/leaflet/') ||
                id.includes('node_modules/react-leaflet/')) {
              return 'map';
            }
            // Everything else (React, recharts, d3-*, @plotly/d3,
            // framer-motion, @tanstack, three-* helpers, all
            // transitive deps) stays in vendor so no cross-chunk
            // cycles can form.
            return 'vendor';
          },
        },
      },
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
