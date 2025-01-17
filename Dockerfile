FROM node:18 AS builder
WORKDIR /app
ADD ./server/ ./
RUN npm install

FROM cgr.dev/chainguard/node:18
WORKDIR /app
COPY --chown=node:node --from=builder /app ./
CMD ["/usr/bin/npm", "start"]
EXPOSE 8080
