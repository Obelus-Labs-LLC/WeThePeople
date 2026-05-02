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
            // plotly.js is the single biggest dep (~3-4 MB minified)
            // and is only used on MoneyFlowPage. The page already
            // dynamic-imports plotly, but the manualChunks rule was
            // routing it back into vendor. Give it its own chunk so
            // every page that doesn't use plotly stops paying for it.
            if (id.includes('plotly')) {
              return 'plotly';
            }
            // Force-graph + d3-force: rendering on InfluenceNetworkPage
            if (id.includes('react-force-graph') || id.includes('d3-force') ||
                id.includes('three-')  /* three.js sometimes pulls in */) {
              return 'graph';
            }
            // Leaflet + react-leaflet: ChoroplethMap on InfluenceMapPage
            if (id.includes('leaflet')) {
              return 'map';
            }
            // Recharts + d3 internals: TrendChart and friends
            if (id.includes('recharts') || /node_modules\/d3-/.test(id)) {
              return 'charts';
            }
            if (id.includes('framer-motion')) {
              return 'motion';
            }
            // @tanstack table+virtual are heavyish; bucket them so
            // pages that don't render tables stay light.
            if (id.includes('@tanstack')) {
              return 'tanstack';
            }
            // Everything else stays in the default vendor chunk.
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
