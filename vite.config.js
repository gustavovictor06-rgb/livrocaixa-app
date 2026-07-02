import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANTE para o GitHub Pages:
// o "base" precisa ser "/nome-do-seu-repositorio/" (com as barras).
// Se você renomear o repositório no GitHub, atualize o valor abaixo também.
export default defineConfig({
  plugins: [react()],
  base: '/livrocaixa-app/',
});
