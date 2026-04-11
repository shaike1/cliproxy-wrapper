FROM node:lts-alpine

WORKDIR /app

# Copy binary and Node wrapper
COPY cli-proxy-api ./cli-proxy-api
COPY wrapper.js ./wrapper.js

# Copy patches and static assets
COPY patches/ ./patches/
COPY static/ ./static/

RUN chmod +x /app/cli-proxy-api

# Entrypoint: start both cli-proxy-api and wrapper.js
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8317 8318

ENTRYPOINT ["/app/docker-entrypoint.sh"]
