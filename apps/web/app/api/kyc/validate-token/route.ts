/**
 * KYC Session Token Validation Endpoint
 *
 * POST /api/kyc/validate-token
 *
 * This server-side API route validates JWT tokens issued during the KYC session
 * initiation flow (POST /v1/kyc/initiate). When a client application redirects
 * a user to the KYC frontend via the kycFlowUrl, the /kyc/start page calls this
 * endpoint to verify the token before bootstrapping the KYC session.
 *
 * The JWT is signed with JWT_KYC_SESSION_SECRET (shared between the NestJS API
 * and this Next.js frontend) and contains:
 *   - clientId: The tenant's internal ID
 *   - userId: The mapped internal user ID
 *   - externalUserId: The client app's user identifier
 *   - kycSessionId: Alias for the KYC submission ID
 *   - apiKey: The tenant's raw API key for subsequent authenticated requests
 *   - returnUrl: Where to redirect the user after KYC completion or cancellation
 *
 * Security: This route runs on the Node.js runtime (not Edge) so that the
 * JWT_KYC_SESSION_SECRET environment variable stays server-side and is never
 * exposed to the browser.
 */
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

/**
 * Shape of the decoded JWT payload.
 * Must match the payload structure created in ClientKycService.initiateKyc().
 */
interface KycSessionPayload {
  clientId: string;
  userId: string;
  externalUserId: string;
  kycSessionId: string;
  apiKey: string;
  returnUrl?: string;
}

/**
 * Force Node.js runtime so we can access server-only environment variables.
 * Edge runtime would not have access to JWT_KYC_SESSION_SECRET.
 */
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body -- expects { token: string }
    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        {
          valid: false,
          error: 'Missing or invalid token parameter',
        },
        { status: 400 },
      );
    }

    // Read the shared secret from the server-side environment.
    // This secret must match the one used by the NestJS API when signing the JWT.
    const secret = process.env.JWT_KYC_SESSION_SECRET;

    if (!secret) {
      console.error(
        '[validate-token] JWT_KYC_SESSION_SECRET is not configured. ' +
          'Please set this environment variable in the web app.',
      );
      return NextResponse.json(
        {
          valid: false,
          error: 'Server configuration error',
        },
        { status: 500 },
      );
    }

    // Verify and decode the JWT. This checks both the signature and expiration.
    // Throws if the token is invalid, expired, or tampered with.
    const decoded = jwt.verify(token, secret) as KycSessionPayload;

    // Return the decoded payload so the /kyc/start page can bootstrap the session
    return NextResponse.json({
      valid: true,
      clientId: decoded.clientId,
      userId: decoded.userId,
      externalUserId: decoded.externalUserId,
      kycSessionId: decoded.kycSessionId,
      apiKey: decoded.apiKey,
      returnUrl: decoded.returnUrl || null,
    });
  } catch (error: unknown) {
    // Handle specific JWT error types for clear client-side messaging
    if (error instanceof jwt.TokenExpiredError) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Token has expired. Please request a new KYC session link.',
        },
        { status: 401 },
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Invalid token. The session link may be corrupted or tampered with.',
        },
        { status: 401 },
      );
    }

    // Unexpected errors
    console.error('[validate-token] Unexpected error during token validation:', error);
    return NextResponse.json(
      {
        valid: false,
        error: 'An unexpected error occurred during token validation.',
      },
      { status: 500 },
    );
  }
}
