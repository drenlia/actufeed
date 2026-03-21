#!/bin/bash

# Build script for ACTUFEED
# This script builds and starts the Docker container

set -e  # Exit on error

echo "🚀 Building and starting ACTUFEED..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker compose is available
if ! docker compose version > /dev/null 2>&1; then
    echo "❌ Error: Docker Compose is not installed or not available."
    echo "   Please install Docker Compose v2.0+ and try again."
    exit 1
fi

# Build and start the containers
echo "📦 Building Docker image..."
docker compose build

echo ""
echo "🚀 Starting containers..."
docker compose up -d

echo ""
echo "✅ Application is starting up!"
echo ""
echo "📰 Access the application at: http://localhost:3072"
echo ""
echo "💡 Useful commands:"
echo "   View logs:    docker compose logs -f actufeed"
echo "   Stop app:     docker compose down"
echo "   Restart app:  docker compose restart"
echo ""
