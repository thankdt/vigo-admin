# Static build → nginx. Mirrors production (Next static export served as files),
# so the dev server is fast (minified, cacheable, no on-demand compile) instead
# of `next dev`. Rebuilt on every deploy by the Jenkins pipeline.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* is inlined at BUILD time for a static export, so the backend API
# base URL must be present here (not at runtime).
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
# `next build` with output:'export' emits the static site to /app/out.
# NOT `npm run build` — that also runs deploy:prod → publishes to the prod S3 bucket.
RUN npx next build

# Serve the static export with nginx.
FROM nginx:alpine AS static
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html
EXPOSE 9002
