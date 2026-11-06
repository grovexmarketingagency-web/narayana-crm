import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// SINGLE=1 builds one self-contained index.html (for sharing as a link / offline use)
export default defineConfig({
  plugins: process.env.SINGLE ? [react(), viteSingleFile()] : [react()],
  base: './',
})
