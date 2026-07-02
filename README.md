# LivroCaixa — Planejador Financeiro Pessoal

Site pessoal para gerenciar renda, despesas (com controle de parcelamentos), reserva
de emergência, meta de viagem e um plano de investimento simulado para 3 anos.

## Rodando localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou superior).

```bash
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente `http://localhost:5173`).

## Colocando no ar direto pelo GitHub (GitHub Pages) — grátis

1. Crie um repositório novo no GitHub, por exemplo chamado `livrocaixa-app`.
2. Suba este projeto para ele:
   ```bash
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/livrocaixa-app.git
   git push -u origin main
   ```
3. Se você deu ao repositório um nome **diferente** de `livrocaixa-app`, abra o
   arquivo `vite.config.js` e troque `base: '/livrocaixa-app/'` pelo nome do
   seu repositório, no formato `/nome-do-repositorio/`.
4. No GitHub, vá em **Settings → Pages** do repositório e, em "Build and
   deployment", escolha a opção **GitHub Actions** como fonte.
5. Pronto. Esse projeto já vem com um workflow em
   `.github/workflows/deploy.yml` que builda e publica o site automaticamente
   toda vez que você der `git push` na branch `main`.
6. Depois do primeiro deploy (acompanhe em **Actions**, ali no topo do
   repositório), seu site fica disponível em:
   `https://SEU-USUARIO.github.io/livrocaixa-app/`

## Alternativas (Vercel / Netlify)

Se preferir, também dá pra publicar conectando o repositório em
[vercel.com](https://vercel.com) ou [netlify.com](https://netlify.com) — eles
detectam o Vite sozinhos. Nesse caso, deixe o `base` do `vite.config.js` como `'/'`.

## Onde ficam seus dados

Os dados (renda, despesas, metas, investimento) ficam salvos no `localStorage`
do seu navegador — ou seja, só no seu computador/navegador, ninguém mais vê. Se
limpar o cache do navegador ou trocar de dispositivo, os dados não te acompanham.

Se no futuro você quiser acessar de vários dispositivos (celular e computador,
por exemplo), o próximo passo natural é trocar o `localStorage` por um banco de
dados como Supabase ou Firebase — me chame que eu te ajudo a adaptar.

## Estrutura do projeto

```
livrocaixa-app/
├── .github/workflows/deploy.yml   # publica automaticamente no GitHub Pages
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx     # ponto de entrada
    └── App.jsx      # todo o app (painel, despesas, reserva, viagem, investimento)
```
