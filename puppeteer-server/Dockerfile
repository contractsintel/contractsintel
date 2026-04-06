FROM ghcr.io/puppeteer/puppeteer:22.0.0

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3001
CMD ["node", "server.js"]
