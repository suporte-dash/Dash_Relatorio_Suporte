FROM node:24-alpine

WORKDIR /app

COPY . .

RUN mkdir -p /app/storage

VOLUME ["/app/storage"]

EXPOSE 8085

CMD ["node", "server.js"]
