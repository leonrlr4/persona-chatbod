#!/bin/bash

# Configuration
EC2_HOST="bible-persona"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

show_help() {
  echo "Persona Chatbot Management Script"
  echo ""
  echo "Usage: ./manage.sh [command]"
  echo ""
  echo "Commands:"
  echo "  logs      - Show container logs (follow mode)"
  echo "  status    - Show container status"
  echo "  restart   - Restart the container"
  echo "  stop      - Stop the container"
  echo "  start     - Start the container"
  echo "  health    - Check application health"
  echo "  ssh       - SSH into EC2"
  echo "  shell     - Open shell in container"
  echo ""
}

case "$1" in
  logs)
    echo -e "${BLUE}Showing container logs...${NC}"
    ssh ${EC2_HOST} "docker compose logs -f"
    ;;

  status)
    echo -e "${BLUE}Container status:${NC}"
    ssh ${EC2_HOST} "docker compose ps"
    echo ""
    echo -e "${BLUE}Resource usage:${NC}"
    ssh ${EC2_HOST} "docker stats --no-stream persona-chatbot"
    ;;

  restart)
    echo -e "${YELLOW}Restarting container...${NC}"
    ssh ${EC2_HOST} "docker compose restart"
    echo -e "${GREEN}✓ Container restarted${NC}"
    ;;

  stop)
    echo -e "${YELLOW}Stopping container...${NC}"
    ssh ${EC2_HOST} "docker compose down"
    echo -e "${GREEN}✓ Container stopped${NC}"
    ;;

  start)
    echo -e "${BLUE}Starting container...${NC}"
    ssh ${EC2_HOST} "docker compose up -d"
    echo -e "${GREEN}✓ Container started${NC}"
    ;;

  health)
    echo -e "${BLUE}Checking application health...${NC}"
    HEALTH=$(ssh ${EC2_HOST} "curl -s http://localhost:3000/api/health")
    echo "${HEALTH}" | jq . 2>/dev/null || echo "${HEALTH}"
    ;;

  ssh)
    echo -e "${BLUE}Connecting to EC2...${NC}"
    ssh ${EC2_HOST}
    ;;

  shell)
    echo -e "${BLUE}Opening shell in container...${NC}"
    ssh -t ${EC2_HOST} "docker exec -it persona-chatbot sh"
    ;;

  *)
    show_help
    ;;
esac
