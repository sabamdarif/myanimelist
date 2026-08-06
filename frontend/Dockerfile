# Frontend: Next.js standalone
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# distroless: node runtime only — no shell, no npm, smaller attack surface
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nonroot
EXPOSE 3000
CMD ["server.js"]
