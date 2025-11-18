#!/bin/bash

set -e

echo "=========================================="
echo "  Persona Chatbot - One-Click Deployment"
echo "=========================================="
echo ""

# Configuration
EC2_HOST="bible-persona"
EC2_USER="ubuntu"
IMAGE_NAME="persona-chatbot"
IMAGE_TAG="latest"
TAR_FILE="persona-chatbot-amd64.tar"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Build Docker Image
echo -e "${BLUE}[1/5] Building Docker image for AMD64...${NC}"
docker build --platform linux/amd64 -t ${IMAGE_NAME}:${IMAGE_TAG} .
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 2: Save Docker Image
echo -e "${BLUE}[2/5] Saving Docker image to tar file...${NC}"
docker save -o ${TAR_FILE} ${IMAGE_NAME}:${IMAGE_TAG}
IMAGE_SIZE=$(du -h ${TAR_FILE} | cut -f1)
echo -e "${GREEN}✓ Image saved (${IMAGE_SIZE})${NC}"
echo ""

# Step 3: Transfer to EC2
echo -e "${BLUE}[3/5] Transferring image to EC2...${NC}"
rsync -avz --progress ${TAR_FILE} ${EC2_HOST}:~/
echo -e "${GREEN}✓ Transfer completed${NC}"
echo ""

# Step 4: Load and Deploy on EC2
echo -e "${BLUE}[4/5] Loading image and deploying on EC2...${NC}"
ssh ${EC2_HOST} << 'ENDSSH'
  # Load Docker image
  echo "Loading Docker image..."
  docker load -i persona-chatbot-amd64.tar

  # Stop and remove old container
  echo "Stopping old container..."
  docker compose down || true

  # Start new container
  echo "Starting new container..."
  docker compose up -d

  # Wait for container to be healthy
  echo "Waiting for container to start..."
  sleep 5

  # Check status
  docker compose ps
ENDSSH
echo -e "${GREEN}✓ Deployment completed${NC}"
echo ""

# Step 5: Verify
echo -e "${BLUE}[5/5] Verifying deployment...${NC}"
ssh ${EC2_HOST} "curl -s http://localhost:3000/api/health" > /dev/null
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Health check passed${NC}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  exit 1
fi
echo ""

# Cleanup
echo -e "${BLUE}Cleaning up local tar file...${NC}"
rm -f ${TAR_FILE}
echo -e "${GREEN}✓ Cleanup completed${NC}"
echo ""

echo "=========================================="
echo -e "${GREEN}  Deployment Successful! 🎉${NC}"
echo "=========================================="
echo ""
echo "Your application is now running at:"
echo "  • HTTPS: https://43.212.238.36"
echo "  • HTTP:  http://43.212.238.36 (redirects to HTTPS)"
echo ""
echo "To view logs: ssh ${EC2_HOST} 'docker compose logs -f'"
echo "To check status: ssh ${EC2_HOST} 'docker compose ps'"
echo ""
