import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    return {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      css: {
        preprocessorOptions: {
          scss: {
            // Include paths for @import resolution
            includePaths: ['node_modules'],
            // Modern Sass API
            api: 'modern-compiler' as 'modern-compiler'
          }
        },
        // Enable CSS minification
        devSourcemap: true
      },
      build: {
        // Enable CSS minification in production
        cssMinify: true,
        // Generate source maps for CSS
        sourcemap: true
      }
    };
});
