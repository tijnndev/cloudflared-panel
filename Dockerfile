# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM golang:1.22-alpine AS backend-build
WORKDIR /app
RUN apk add --no-cache git
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /cloudflared-panel .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates cloudflared
WORKDIR /app
COPY --from=backend-build /cloudflared-panel /app/cloudflared-panel
COPY --from=frontend-build /app/dist /app/static
ENV STATIC_DIR=/app/static
ENV DATA_DIR=/data
ENV PORT=8090
EXPOSE 8090
ENTRYPOINT ["/app/cloudflared-panel"]
