#!/bin/bash
set -e

echo "================================"
echo "CoSeal Setup Script"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Please install Docker first."
  echo "   Visit: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo "❌ docker-compose is not installed. Please install docker-compose first."
  exit 1
fi

# Use docker compose if available, otherwise docker-compose
if docker compose version &> /dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
else
  COMPOSE_CMD="docker-compose"
fi

echo "✓ Docker found"
echo ""

# Generate .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "[1/5] Creating .env file from template..."
  cp .env.example .env
  
  # Generate random encryption key and API key
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  API_KEY=$(openssl rand -hex 32)
  
  # Update .env with generated keys
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/your-encryption-key-at-least-32-chars/$ENCRYPTION_KEY/" .env
    sed -i '' "s/your-api-key-here/$API_KEY/" .env
  else
    # Linux
    sed -i "s/your-encryption-key-at-least-32-chars/$ENCRYPTION_KEY/" .env
    sed -i "s/your-api-key-here/$API_KEY/" .env
  fi
  
  echo "  ✓ .env file created with generated keys"
  echo "  ⚠ API Key: $API_KEY"
  echo "  ⚠ Save this API key! You'll need it to access the API."
else
  echo "[1/5] .env file already exists, skipping..."
fi
echo ""

# Generate self-signed certificates if they don't exist
if [ ! -f certs/signing-cert.pem ] || [ ! -f certs/signing-key.pem ]; then
  echo "[2/5] Generating self-signed development certificates..."
  mkdir -p certs
  npx tsx scripts/generate-dev-cert.ts
  echo "  ✓ Certificates generated in ./certs/"
  echo "  ⚠ These are self-signed certificates for development only."
  echo "  ⚠ For production, obtain certificates from a trusted CA."
else
  echo "[2/5] Certificates already exist, skipping..."
fi
echo ""

# Start Docker services
echo "[3/5] Starting Docker services..."
$COMPOSE_CMD up -d
echo "  ✓ Docker services starting..."
echo ""

# Wait for services to be healthy
echo "[4/5] Waiting for services to be ready..."
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  if $COMPOSE_CMD ps | grep -q "unhealthy"; then
    echo "  ⏳ Services still starting... (${ELAPSED}s)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  elif $COMPOSE_CMD ps api | grep -q "healthy"; then
    echo "  ✓ Services are healthy!"
    break
  else
    echo "  ⏳ Waiting for health checks... (${ELAPSED}s)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  fi
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "  ⚠ Services did not become healthy within ${MAX_WAIT}s."
  echo "  Check logs with: $COMPOSE_CMD logs"
  exit 1
fi
echo ""

# Run database migrations
echo "[5/5] Running database migrations..."
$COMPOSE_CMD exec -T api npx drizzle-kit push:pg || {
  echo "  ⚠ Migrations may have already run, continuing..."
}
echo "  ✓ Database ready"
echo ""

# Final status check
echo "================================"
echo "✅ CoSeal is running!"
echo "================================"
echo ""
echo "API:              http://localhost:3000"
echo "Health check:     http://localhost:3000/health"
echo "Signing UI:       http://localhost:3000/sign/test (when you create an envelope)"
echo "MinIO Console:    http://localhost:9001 (minioadmin / minioadmin)"
echo ""
echo "Your API Key:     $(grep API_KEY .env | cut -d '=' -f2)"
echo ""
echo "Next steps:"
echo "  - Test the API:    curl -H 'Authorization: Bearer <your-api-key>' http://localhost:3000/health"
echo "  - Run E2E test:    npx tsx scripts/e2e-test.ts"
echo "  - View logs:       $COMPOSE_CMD logs -f api"
echo "  - Stop services:   $COMPOSE_CMD down"
echo ""
echo "For production deployment, see docs/DEPLOYMENT.md"
echo ""
