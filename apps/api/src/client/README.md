# Client Module

Multi-tenancy support for KYC SaaS platform. Handles client authentication, API key management, and webhook configuration.

## Components

### ClientService
- `generateApiKey()`: Generate secure API keys (SHA-256 hashed)
- `validateApiKey()`: Authenticate API requests
- `createClient()`: Onboard new client organizations
- `updateWebhookConfig()`: Configure webhook endpoints

### TenantMiddleware
- Extracts `X-API-Key` header
- Validates client status (ACTIVE)
- Injects `req.clientId` and `req.client`
- Applied to `/api/v1/*` routes

### Decorators
- `@Client()`: Extract authenticated client from request

## Usage

### Client Authentication
```typescript
// Client makes API request
fetch('/api/v1/kyc/initiate', {
  headers: { 'X-API-Key': 'client_abc123...' }
});

// Controller receives authenticated client
@Post('initiate')
async initiate(@Client() client: ClientEntity) {
  console.log(client.id, client.name);
}
```

### Creating Clients (Super Admin)
```typescript
const { plaintext, hashed } = clientService.generateApiKey();
const client = await clientService.createClient({
  name: 'SMC Private Wealth',
  webhookUrl: 'https://client.com/webhook',
  webhookSecret: 'wh_secret_abc123'
});
// Display plaintext key once, then clear
console.log('API Key:', client.apiKeyPlaintext);
await clientService.clearApiKeyPlaintext(client.id);
```

## Security

- API keys are SHA-256 hashed before storage
- Plaintext keys shown once during creation, then nullified
- Webhook secrets stored plaintext (needed for HMAC signing)
- Rate limiting: 100 requests/minute per client
- Inactive clients rejected at middleware level

## Testing

### Unit Tests (Phase 11)
- `ClientService.generateApiKey()`: Verify key format and uniqueness
- `ClientService.validateApiKey()`: Test valid/invalid/inactive scenarios
- `TenantMiddleware`: Mock authentication flow

### Integration Tests (Phase 11)
- End-to-end API key authentication
- Rate limiting enforcement
- Multi-client data isolation
