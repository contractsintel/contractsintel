FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app
COPY package.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 3001
CMD ["node", "server.js"]
