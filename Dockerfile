FROM node:24-alpine

WORKDIR /app

COPY . .

RUN mkdir -p /app/uploads

VOLUME ["/app/uploads"]

EXPOSE 8085

CMD ["node", "server.js"]
