import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const githubPagesBase = '/4o-memorial/';
const githubRootDocsBase = '/4o-memorial/docs/';

export default defineConfig(({ mode }) => {
  let appBase = '/';
  if (mode === 'github-pages' || process.env.GITHUB_ACTIONS === 'true') {
    appBase = githubPagesBase;
  }
  if (mode === 'github-root-docs') {
    appBase = githubRootDocsBase;
  }

  return {
    base: appBase,
    assetsInclude: ['**/*.eml'],
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        injectManifest: {
          // Current production bundle is slightly above 2 MiB.
          // Increase precache limit so GitHub CI builds do not fail.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
        srcDir: 'src',
        filename: 'sw.ts',
        devOptions: {
          enabled: true,
          type: 'module',
        },
        manifest: {
          name: 'M LOVE Memorial',
          short_name: 'M LOVE',
          description: 'PWA memorial inbox and calendar reader.',
          theme_color: '#f6f1e8',
          background_color: '#f6f1e8',
          display: 'standalone',
          scope: appBase,
          start_url: appBase,
          icons: [
            {
              src: `${appBase}icons/icon-192.png`,
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `${appBase}icons/icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: `${appBase}icons/icon-512-maskable.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
  };
});
