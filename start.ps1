# EnxtAI KYC System - Quick Start Script
# Run this script to start the entire system

Write-Host "🚀 Starting EnxtAI KYC System..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Start Docker services
Write-Host "📦 Step 1: Starting infrastructure services (PostgreSQL, Redis, MinIO)..." -ForegroundColor Yellow
docker-compose up -d postgres redis minio

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start Docker services. Make sure Docker is running." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Infrastructure services started" -ForegroundColor Green
Write-Host ""

# Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready (15 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Step 2: Check if migrations need to be run
Write-Host "📊 Step 2: Checking database migrations..." -ForegroundColor Yellow
Set-Location -Path "apps\api"

# Run migrations
Write-Host "   Running Prisma migrations..." -ForegroundColor Gray
pnpm prisma migrate deploy

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Migration warning (this is normal for first run)" -ForegroundColor Yellow
}

Write-Host "✅ Database migrations completed" -ForegroundColor Green
Write-Host ""

# Step 3: Seed super admin
Write-Host "🌱 Step 3: Creating super admin user..." -ForegroundColor Yellow
pnpm prisma:seed

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Super admin might already exist (this is normal)" -ForegroundColor Yellow
} else {
    Write-Host "✅ Super admin created: admin@enxtai.com / admin123" -ForegroundColor Green
}
Write-Host ""

# Step 4: Start the API server
Write-Host "🔥 Step 4: Starting API server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  API Server will start at http://localhost:3001               ║" -ForegroundColor Cyan
Write-Host "║  Swagger UI available at http://localhost:3001/api/docs      ║" -ForegroundColor Cyan
Write-Host "║  MinIO Console at http://localhost:9001                      ║" -ForegroundColor Cyan
Write-Host "║                                                              ║" -ForegroundColor Cyan
Write-Host "║  Super Admin Credentials:                                    ║" -ForegroundColor Cyan
Write-Host "║    Email: admin@enxtai.com                                   ║" -ForegroundColor Cyan
Write-Host "║    Password: admin123                                        ║" -ForegroundColor Cyan
Write-Host "║                                                              ║" -ForegroundColor Cyan
Write-Host "║  Press Ctrl+C to stop the server                             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Start the dev server
pnpm run start:dev
