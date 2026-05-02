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
            // SPLIT POLICY (post-2026-05-02 black-screen incident):
            //
            // The previous, more aggressive split (recharts / d3 /
            // framer-motion / @tanstack each in their own chunk)
            // produced a circular ESM edge between vendor and
            // charts: vendor.js imported symbols from charts.js
            // while charts.js imported React from vendor.js. The
            // module that initialised second saw the first's
            // exports as `undefined`, surfacing as
            //   "Cannot read properties of undefined (reading
            //    'forwardRef')"
            // when recharts evaluated `g.forwardRef` at top level
            // before vendor had finished setting up React. That was
            // the actual root cause of the black-screen outage —
            // the bare `buffer/` specifier was the FIRST visible
            // crash, but fixing it just unmasked the cycle.
            //
            // Rule: only split a chunk if it is (a) genuinely huge
            // and (b) a leaf — nothing in vendor calls back into it.
            // plotly, react-force-graph + three, and leaflet pass
            // both. Recharts, d3, framer-motion, @tanstack all fail
            // (b) and stay in vendor. The price is a fatter vendor
            // chunk on first paint; the benefit is the site mounts.
            if (id.includes('plotly')) {
              return 'plotly';
            }
            // Force-graph + three.js: dynamic-imported by InfluenceNetworkPage.
            // d3-force is REMOVED from this rule — d3 modules are
            // also pulled in by recharts (which now lives in vendor),
            // so isolating any d3 module re-creates the cycle.
            if (id.includes('react-force-graph') || id.includes('three-')) {
              return 'graph';
            }
            // Leaflet + react-leaflet: ChoroplethMap on InfluenceMapPage.
            if (id.includes('leaflet')) {
              return 'map';
            }
            // Everything else (React, recharts, d3-*, framer-motion,
            // @tanstack, and all transitive deps) stays in vendor so
            // no cross-chunk cycles can form.
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
