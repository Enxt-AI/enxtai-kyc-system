# EnxtAI KYC Deployment Guide

This guide explains how to deploy the EnxtAI KYC System from scratch.
The Web Frontend is built for **Vercel**, and the Backend API & Databases are run via **Docker Compose** on an **AWS EC2** instance.

## Prerequisites
- **AWS Account** (For backend EC2 instance)
- **Vercel Account** (For frontend deployment)
- **GitHub/GitLab Account** (To host the repository)
- **SSH Client** (Terminal/Git Bash/PowerShell)

---

## Part 1: AWS EC2 Backend Setup

### 1. Provision the EC2 Instance
1. Log in to your AWS Console and go to **EC2 -> Launch Instance**.
2. **Name**: `enxtai-kyc-backend`
3. **OS**: Select **Amazon Linux 2023** (or Ubuntu 24.04 LTS).
4. **Instance Type**: Select `t3.small` (minimum 2GB RAM required for building).
5. **Key Pair**: Create a new `.pem` key (e.g., `kyc-key.pem`) and download it.
6. **Network Settings**:
   - Allow SSH traffic from *Anywhere* (or your IP).
   - Allow HTTP/HTTPS traffic from *Anywhere*.
   - **Custom TCP**: Allow Port `3001` (API) from *Anywhere* (temporary, until you setup a domain reverse proxy).
7. **Storage**: Allocate at least **30GB gp3**.
8. Click **Launch**.

### 2. Connect to the EC2 Instance
Open your terminal on your local machine containing the `kyc-key.pem` file.

```bash
# Correct permissions for the key (macOS/Linux only)
chmod 400 kyc-key.pem

# Connect to the server
ssh -i kyc-key.pem ec2-user@<YOUR_EC2_PUBLIC_IP>
```

### 3. Server Initialization Setup
Once inside the EC2 terminal, we need to install Git, Docker, and configure memory Swap Space (so NextJS builds don't run out of memory).

Run these commands on the EC2 server:

```bash
sudo dnf update -y
sudo dnf install -y git docker htop

# Create 2GB Swap Memory
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Allow 'ec2-user' to run Docker without sudo
sudo usermod -aG docker ec2-user
```
**Important:** Type `exit` to disconnect from SSH, then SSH back in for the Docker permissions to apply.

---

## Part 2: Deploying the Backend Code & Environment

### 1. Transfer Code to AWS
On your **Local Machine**, clone the repo and compress the backend components:

```bash
git clone <your-repo-url> enxtai-kyc-system
cd enxtai-kyc-system

# Use git archive to bundle the necessary backend files into a tar ZIP
git archive -o backend.tar HEAD apps/api packages docker-compose.yml package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json

# Send the zip to the EC2 server
scp -i kyc-key.pem backend.tar ec2-user@<YOUR_EC2_PUBLIC_IP>:~/backend.tar
```

### 2. Configure AWS Environment Variables
On your **Local Machine**, create a file named `.env.aws` with the following variables so the Docker containers can talk to each other correctly:

```env
# Database - Using Docker internal network name 'postgres'
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/kyc_db"

# Redis - Using Docker internal network name 'redis'
REDIS_URL="redis://redis:6379"

# MinIO - Using Docker internal network name 'minio'
MINIO_ENDPOINT="minio"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_USE_SSL="false"
MINIO_PAN_BUCKET="pan-cards"
MINIO_AADHAAR_BUCKET="aadhaar-cards"
MINIO_LIVE_PHOTO_BUCKET="live-photos"

# ML Service
ML_SERVICE_URL="http://ml-service:8000"

# API Secrets
JWT_SECRET="your-super-secure-production-secret"
PORT="3001"
```

Send this environment configuration file to your EC2 server as `.env`:

```bash
scp -i kyc-key.pem .env.aws ec2-user@<YOUR_EC2_PUBLIC_IP>:~/.env
```

### 3. Build & Run the Backend Cluster
SSH back into your **EC2 Server** and extract the code:

```bash
# Connect
ssh -i kyc-key.pem ec2-user@<YOUR_EC2_PUBLIC_IP>

# Extract the code bundle
tar -xvf backend.tar

# Build the containers and launch the databases in detached mode
docker compose up -d --build
```
*Note: The API Dockerfile contains a startup script that automatically pushes Prisma schemas and runs the DB Seed every time the API container boots.*

You can verify the cluster is running, and stream the API logs using:
```bash
docker ps
docker logs -f kyc-api
```

Your Backend API is now live at `http://<YOUR_EC2_PUBLIC_IP>:3001`!

---

## Part 3: Vercel Frontend Deployment

The Next.js frontend is built using Turborepo and lives in `apps/web`.

### 1. Import to Vercel
1. Log in to Vercel, click **Add New Project**, and import your `enxtai-kyc-system` GitHub repository.
2. Ensure the **Framework Preset** is `Next.js`.
3. Set the **Root Directory** to `apps/web`.

### 2. Override the Build Command
Because Turborepo requires the shared packages to be built properly:
1. Under **Build and Output Settings**, override the **Build Command**.
2. Enter this exact command:
   ```bash
   cd ../.. && pnpm turbo run build --filter=@enxtai/web
   ```

### 3. Environment Variables
Add the following required variables in the Vercel dashboard before clicking Deploy:

| Name | Value | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://<YOUR_EC2_PUBLIC_IP>:3001` | Points the frontend to your AWS API server |
| `NEXTAUTH_URL` | `https://your-app-domain.vercel.app` | Required for NextAuth valid redirect domains |
| `NEXTAUTH_SECRET` | `generate-a-random-secure-string` | Used to encrypt NextAuth user sessions securely |

Click **Deploy**! Once compiled, your users can successfully sign up and trigger KYC verification fully interconnected with your AWS cloud databases!
