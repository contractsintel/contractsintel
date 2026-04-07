FROM mcr.microsoft.com/playwright:v1.59.1-noble

# Force fresh build — 2026-04-06
ENV BUILD_TS=20260407v1 \
    NODE_ENV=production

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 3001
CMD ["node", "server.js"]
