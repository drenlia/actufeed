# Docker Setup for ACTUFEED

This project is containerized using Docker Compose v2.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+

## Quick Start

1. **Build and start the application:**
   ```bash
   docker compose up -d
   ```

2. **View logs:**
   ```bash
   docker compose logs -f actufeed
   ```

3. **Stop the application:**
   ```bash
   docker compose down
   ```

4. **Rebuild after code changes:**
   ```bash
   docker compose up -d --build
   ```

## Access the Application

Once the container is running, access the application at:
- **URL:** http://localhost:3072

## Configuration

The application runs on port **3072** as configured in:
- `vite.config.js` - Development and preview server port
- `docker-compose.yml` - Container port mapping
- `Dockerfile` - Container exposed port

## Docker Compose Commands

- `docker compose up` - Start services
- `docker compose up -d` - Start services in detached mode
- `docker compose down` - Stop and remove containers
- `docker compose ps` - List running containers
- `docker compose logs` - View logs
- `docker compose build` - Build images
- `docker compose restart` - Restart services

## Troubleshooting

If you encounter issues:

1. **Check container status:**
   ```bash
   docker compose ps
   ```

2. **View container logs:**
   ```bash
   docker compose logs actufeed
   ```

3. **Rebuild from scratch:**
   ```bash
   docker compose down
   docker compose build --no-cache
   docker compose up -d
   ```

4. **Check if port 3072 is available:**
   ```bash
   lsof -i :3072  # macOS/Linux
   netstat -ano | findstr :3072  # Windows
   ```
