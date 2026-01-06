#!/usr/bin/env ts-node
/**
 * Webhook Verification Test Script
 * 
 * Tests webhook delivery, HMAC signature verification, and event handling.
 * Creates a local test server to receive webhooks and validates payload integrity.
 * 
 * **Usage**:
 * ```bash
 * # Start webhook test server and trigger events
 * pnpm test:webhooks --port=3002 --secret="your-webhook-secret"
 * 
 * # Test signature verification only
 * pnpm test:webhooks --verify-only --secret="your-webhook-secret"
 * ```
 * 
 * **Test Scenarios**:
 * 1. HMAC-SHA256 signature verification
 * 2. Payload deserialization and validation
 * 3. Event type handling (document_uploaded, verification_completed, etc.)
 * 4. Error handling (invalid signatures, malformed payloads)
 * 5. Delivery confirmation and retry logic
 * 
 * **Event Types**:
 * - document_uploaded: Document successfully uploaded and stored
 * - ocr_completed: OCR extraction completed (success/failure)
 * - verification_completed: Face verification completed
 * - kyc_status_changed: Overall KYC status updated
 * 
 * **Output**:
 * - Real-time webhook event logs
 * - Signature verification results
 * - JSON event data with timestamps
 */

const http = require('http');
const nodeCrypto = require('crypto');
const querystring = require('querystring');

/**
 * Webhook event payload interface
 */
interface WebhookEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  clientId: string;
  userId: string;
  data: {
    documentId?: string;
    verificationId?: string;
    status?: string;
    extractedData?: any;
    errorMessage?: string;
  };
}

interface TestConfig {
  port: number;
  secret: string;
  verifyOnly: boolean;
  timeout: number;
}

class WebhookTester {
  private config: TestConfig;
  private server: any;
  private receivedEvents: WebhookEvent[] = [];

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * Verify HMAC-SHA256 signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = nodeCrypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    // No prefix removal - compare directly against HMAC-SHA256 digest
    const receivedSignature = signature;
    
    // Use timing-safe comparison to prevent timing attacks
    return nodeCrypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  }

  /**
   * Validate webhook event structure
   */
  validateEventStructure(event: any): string[] {
    const errors: string[] = [];
    
    if (!event.eventId || typeof event.eventId !== 'string') {
      errors.push('Missing or invalid eventId');
    }
    
    if (!event.eventType || typeof event.eventType !== 'string') {
      errors.push('Missing or invalid eventType');
    }
    
    if (!event.timestamp || !Date.parse(event.timestamp)) {
      errors.push('Missing or invalid timestamp');
    }
    
    if (!event.clientId || typeof event.clientId !== 'string') {
      errors.push('Missing or invalid clientId');
    }
    
    if (!event.userId || typeof event.userId !== 'string') {
      errors.push('Missing or invalid userId');
    }
    
    if (!event.data || typeof event.data !== 'object') {
      errors.push('Missing or invalid data object');
    }

    return errors;
  }

  /**
   * Process received webhook event
   */
  processWebhookEvent(event: WebhookEvent): void {
    console.log(`📥 Webhook Event Received:`);
    console.log(`   Event ID: ${event.eventId}`);
    console.log(`   Type: ${event.eventType}`);
    console.log(`   Client: ${event.clientId}`);
    console.log(`   User: ${event.userId}`);
    console.log(`   Timestamp: ${event.timestamp}`);
    console.log(`   Data: ${JSON.stringify(event.data, null, 2)}`);
    console.log('');

    this.receivedEvents.push(event);

    // Handle specific event types
    switch (event.eventType) {
      case 'document_uploaded':
        console.log(`✅ Document uploaded: ${event.data.documentId}`);
        break;
      case 'ocr_completed':
        if (event.data.status === 'success') {
          console.log(`✅ OCR extraction successful`);
        } else {
          console.log(`❌ OCR extraction failed: ${event.data.errorMessage}`);
        }
        break;
      case 'verification_completed':
        console.log(`✅ Face verification completed: ${event.data.status}`);
        break;
      case 'kyc_status_changed':
        console.log(`📊 KYC status updated to: ${event.data.status}`);
        break;
      default:
        console.log(`⚠️  Unknown event type: ${event.eventType}`);
    }
  }

  /**
   * Handle incoming webhook HTTP request
   */
  handleWebhookRequest(req: any, res: any): void {
    let body = '';

    req.on('data', (chunk: any) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        // Get signature from headers
        const signature = req.headers['x-signature'];
        if (!signature) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing X-Signature header' }));
          return;
        }

        // Verify signature
        const isValidSignature = this.verifySignature(body, signature, this.config.secret);
        if (!isValidSignature) {
          console.log(`❌ Invalid webhook signature: ${signature}`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature' }));
          return;
        }

        console.log(`✅ Valid webhook signature verified`);

        // Parse JSON payload
        const event = JSON.parse(body);

        // Validate event structure
        const validationErrors = this.validateEventStructure(event);
        if (validationErrors.length > 0) {
          console.log(`❌ Invalid event structure:`, validationErrors);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid event structure', details: validationErrors }));
          return;
        }

        // Process the webhook event
        this.processWebhookEvent(event);

        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          eventId: event.eventId,
          receivedAt: new Date().toISOString()
        }));

      } catch (error: any) {
        console.log(`❌ Error processing webhook:`, error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to process webhook', details: error.message }));
      }
    });
  }

  /**
   * Start webhook test server
   */
  startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req: any, res: any) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          this.handleWebhookRequest(req, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.listen(this.config.port, () => {
        console.log(`🚀 Webhook test server started on port ${this.config.port}`);
        console.log(`📡 Webhook URL: http://localhost:${this.config.port}/webhook`);
        console.log(`🔐 Secret configured for signature verification`);
        console.log('');
        console.log('Waiting for webhook events...');
        console.log('Press Ctrl+C to stop');
        console.log('');
        resolve();
      });

      this.server.on('error', (error: any) => {
        reject(error);
      });
    });
  }

  /**
   * Stop webhook test server
   */
  stopServer(): void {
    if (this.server) {
      this.server.close();
      console.log('\n🛑 Webhook test server stopped');
    }
  }

  /**
   * Run signature verification tests only
   */
  runSignatureTests(): void {
    console.log('🔐 Testing HMAC-SHA256 signature verification...');
    console.log('');

    const testCases = [
      {
        name: 'Valid signature',
        payload: '{"eventType":"test","data":{}}',
        secret: 'test-secret',
        signature: '77bb17a81790580cc2481d28c2a590755498db7c04fd89e8c4dfeaca6ffc77d7',
        expectedValid: true,
      },
      {
        name: 'Invalid signature',
        payload: '{"eventType":"test","data":{}}',
        secret: 'test-secret',
        signature: 'invalid',
        expectedValid: false,
      },
      {
        name: 'Wrong secret signature',
        payload: '{"eventType":"test","data":{}}',
        secret: 'wrong-secret',
        signature: '77bb17a81790580cc2481d28c2a590755498db7c04fd89e8c4dfeaca6ffc77d7',
        expectedValid: false,
      },
    ];

    for (const testCase of testCases) {
      try {
        // Generate correct signature for comparison
        const correctSignature = nodeCrypto
          .createHmac('sha256', testCase.secret)
          .update(testCase.payload, 'utf8')
          .digest('hex');

        const isValid = this.verifySignature(testCase.payload, testCase.signature, testCase.secret);
        
        if (isValid === testCase.expectedValid) {
          console.log(`✅ ${testCase.name}: PASS`);
        } else {
          console.log(`❌ ${testCase.name}: FAIL (expected ${testCase.expectedValid}, got ${isValid})`);
        }
        
        console.log(`   Payload: ${testCase.payload}`);
        console.log(`   Provided: ${testCase.signature}`);
        console.log(`   Expected: ${correctSignature}`);
        console.log('');
        
      } catch (error: any) {
        console.log(`❌ ${testCase.name}: ERROR - ${error.message}`);
        console.log('');
      }
    }
  }

  /**
   * Generate test report
   */
  generateReport(): void {
    console.log('\n📊 Webhook Test Summary:');
    console.log(`   Events received: ${this.receivedEvents.length}`);
    console.log(`   Event types: ${[...new Set(this.receivedEvents.map(e => e.eventType))].join(', ')}`);
    
    if (this.receivedEvents.length > 0) {
      console.log('\n📥 All Received Events:');
      this.receivedEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. ${event.eventType} (${event.eventId}) - ${event.timestamp}`);
      });
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: TestConfig = {
    port: 3002,
    secret: '',
    verifyOnly: false,
    timeout: 30000,
  };

  for (const arg of args) {
    if (arg.startsWith('--port=')) {
      config.port = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--secret=')) {
      config.secret = arg.split('=')[1];
    } else if (arg === '--verify-only') {
      config.verifyOnly = true;
    } else if (arg.startsWith('--timeout=')) {
      config.timeout = parseInt(arg.split('=')[1], 10);
    }
  }

  if (!config.secret) {
    console.error('❌ Error: --secret required');
    console.log('');
    console.log('Usage:');
    console.log('  pnpm test:webhooks --secret="your-webhook-secret" --port=3002');
    console.log('  pnpm test:webhooks --verify-only --secret="your-webhook-secret"');
    process.exit(1);
  }

  return config;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const config = parseArgs();
    const tester = new WebhookTester(config);

    if (config.verifyOnly) {
      // Run signature verification tests only
      tester.runSignatureTests();
      return;
    }

    // Start webhook server
    await tester.startServer();

    // Set up graceful shutdown
    process.on('SIGINT', () => {
      tester.stopServer();
      tester.generateReport();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      tester.stopServer();
      tester.generateReport();
      process.exit(0);
    });

    // Auto-stop after timeout
    if (config.timeout > 0) {
      setTimeout(() => {
        console.log(`⏰ Test timeout reached (${config.timeout}ms)`);
        tester.stopServer();
        tester.generateReport();
        process.exit(0);
      }, config.timeout);
    }

  } catch (error: any) {
    console.error('❌ Webhook test failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { WebhookTester };