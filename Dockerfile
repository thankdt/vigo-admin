# Dev image for the Next.js admin. Source is bind-mounted at runtime (compose)
# and node_modules/.next are kept in anonymous volumes, so this stage only needs
# to install deps. `next dev` is SSR — output:'export' in next.config only
# affects `next build`, so the dev server works normally here.
FROM node:22-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 9002

# -H 0.0.0.0 so cloudflared (and the host) can reach it inside the container net.
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
