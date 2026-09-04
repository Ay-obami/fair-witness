import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages project site serves this app from /fair-witness/ — asset URLs
  // must carry the repo path prefix or index.html 404s on /assets/*.
  base: "/fair-witness/",
  plugins: [react(), tailwindcss()],
})
