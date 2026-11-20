import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** 빌드마다 다른 값. 앱 안에 박고, 같은 값을 /version.json으로도 내보내요. */
const BUILD_ID = Date.now().toString(36);

/** 켜둔 앱이 새 버전이 나왔는지 확인할 수 있게 version.json을 만들어요 */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
  build: {
    target: 'es2022',
    cssTarget: 'safari16',
  },
});
