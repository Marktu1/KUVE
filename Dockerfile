# Servidor do Menu 3D (sem GPU). O worker de IA corre à parte: ver ai-worker/.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
COPY web ./web
ENV PORT=3000 DATA_DIR=/data NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
