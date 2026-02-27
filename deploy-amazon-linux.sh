#!/bin/bash
# deploy-amazon-linux.sh
# Run this script on your Amazon Linux t3.small EC2 instance

echo "=========================================="
echo "Starting Application Deployment Setup..."
echo "=========================================="

# 1. Update the system
echo "--> Updating system packages..."
sudo dnf update -y

# 2. Add Swap Space (2 GB) - Crucial for t3.small building Node.js apps
echo "--> Configuring 2GB Swap Memory..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab

# 3. Install Git
echo "--> Installing Git..."
sudo dnf install git -y

# 4. Install Docker
echo "--> Installing Docker..."
sudo dnf install docker -y
sudo systemctl enable docker
sudo systemctl start docker

# Add the 'ec2-user' to the docker group so you can run docker without sudo
sudo usermod -aG docker ec2-user
echo "--> Docker installed. (Note: You may need to log out and log back in for group changes to take effect)."

# 5. Install Docker Compose (V2)
echo "--> Installing Docker Compose..."
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# Verify Docker Compose installation
docker compose version

echo "=========================================="
echo "Server Initialization Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Log out and log back in to apply the 'docker' group permissions: 'exit', then SSH back in."
echo "2. Clone your repository: 'git clone <your-repo-url>'"
echo "3. Copy your env file: 'cp .env.example .env' and update secrets."
echo "4. Modify docker-compose.yml to uncomment the API and Web services."
echo "5. Run: 'docker compose up -d --build'"
