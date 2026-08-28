import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    proxy: {
      '/admin': 'http://localhost:8787',
      '/sub': 'http://localhost:8787',
      '/login': 'http://localhost:8787',
    }
  }
})
