import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    minify: 'none',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'index.js'),
      name: 'Archer',
      // the proper extensions will be added
      fileName: 'Archer',
      formats: ['es', 'umd', 'iife'],
    },
    rollupOptions: {

      // make sure to externalize deps that shouldn't be bundled
      // into your library
      // external: ['goodcore'],
      // output: {
      //   // Provide global variables to use in the UMD build
      //   // for externalized deps
      //   globals: {
      //     vue: 'goodcore',
      //   },
      // },
    },
  },
})
