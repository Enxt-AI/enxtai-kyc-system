# API Key Injection - Quick Reference

## ✅ Implementation Complete

All changes have been implemented and both applications build successfully.

## Files Modified

### API Client
- **File**: `apps/web/src/lib/api-client.ts`
- **Changes**:
  - Added helper functions: `getKycApiKey()`, `setKycApiKey()`, `clearKycApiKey()`
  - Updated request interceptor to inject X-API-Key for `/api/kyc/*` routes
  - Updated response interceptor to handle 401/403 errors

### KYC Pages
- **Files**:
  - `apps/web/src/app/kyc/upload/page.tsx`
  - `apps/web/src/app/kyc/photo/page.tsx`
  - `apps/web/src/app/kyc/signature/page.tsx`
- **Changes**: Added useEffect guards to validate API key on component mount

### Hero Page
- **File**: `apps/web/src/app/page.tsx`
- **Changes**:
  - Updated `handleApiKeySubmit()` to use `setKycApiKey()` helper
  - Added `ErrorBanner` component wrapped in Suspense
  - Added error banner UI with dismiss functionality
  - Parses error query parameters (session_expired, invalid_key, domain_not_whitelisted)

### Verify Page
- **File**: `apps/web/src/app/kyc/verify/page.tsx`
- **Changes**: Updated `handleStartNewKYC()` to call `clearKycApiKey()`

## Helper Functions Usage

### Store API Key
```typescript
import { setKycApiKey } from '@/lib/api-client';

// After successful validation
setKycApiKey(apiKey); // Automatically sets 30min expiry
```

### Retrieve API Key
```typescript
import { getKycApiKey } from '@/lib/api-client';

// Check if key exists and is valid
const apiKey = getKycApiKey(); // Returns null if expired
if (!apiKey) {
  router.replace('/?error=session_expired');
}
```

### Clear API Key
```typescript
import { clearKycApiKey } from '@/lib/api-client';

// On logout or session end
clearKycApiKey(); // Removes key and expiry from sessionStorage
```

## Error Flow

### User Journey with Expired Key
1. User enters API key on hero page
2. Key stored with 30-minute expiry
3. User uploads documents successfully
4. **30 minutes pass**
5. User navigates to photo page
6. Guard detects expired key
7. User redirected to `/?error=session_expired`
8. Error banner displays: "Your session has expired. Please enter your API key again."

### User Journey with Invalid Key
1. User enters API key on hero page
2. Key stored in sessionStorage
3. User makes KYC request
4. **Backend rejects key (401)**
5. Response interceptor catches error
6. `clearKycApiKey()` called
7. User redirected to `/?error=invalid_key`
8. Error banner displays: "Your API key is invalid or has been revoked."

### User Journey with Domain Not Whitelisted
1. User enters API key on hero page
2. Key stored in sessionStorage
3. User makes KYC request
4. **TenantMiddleware rejects origin (403)**
5. Response interceptor catches error
6. `clearKycApiKey()` called
7. User redirected to `/?error=domain_not_whitelisted`
8. Error banner displays: "This domain is not authorized to access the KYC system."

## Build Status

### API Build
```bash
cd apps/api
pnpm build
```
**Status**: ✅ SUCCESS

### Web Build
```bash
cd apps/web
pnpm build
```
**Status**: ✅ SUCCESS

## Testing Commands

### Start Development Servers
```bash
# Terminal 1 - API
cd apps/api
pnpm dev

# Terminal 2 - Web
cd apps/web
pnpm dev
```

### Test API Key Flow
1. Navigate to http://localhost:3000
2. Click "Begin KYC Verification"
3. Enter API key from client settings
4. Verify redirect to /kyc/upload
5. Open DevTools → Network tab
6. Upload document and check request headers
7. Verify `X-API-Key` header present in all `/api/kyc/*` requests

### Test Expired Key
1. Complete API key entry
2. Open DevTools → Application → Session Storage
3. Find `kyc_api_key_expiry`
4. Set value to `1000` (past timestamp)
5. Navigate to any KYC page
6. Verify redirect to hero with error banner

### Test Invalid Key
1. Enter API key
2. Open DevTools → Application → Session Storage
3. Edit `kyc_api_key` to invalid value
4. Upload document
5. Verify redirect to hero with error banner

## SessionStorage Inspector

### View Current Session
```javascript
// In browser console
console.log('API Key:', sessionStorage.getItem('kyc_api_key'));
console.log('Expiry:', new Date(parseInt(sessionStorage.getItem('kyc_api_key_expiry'))));
console.log('Time Remaining:', Math.floor((parseInt(sessionStorage.getItem('kyc_api_key_expiry')) - Date.now()) / 60000), 'minutes');
```

### Clear Session
```javascript
// In browser console
sessionStorage.removeItem('kyc_api_key');
sessionStorage.removeItem('kyc_api_key_expiry');
console.log('Session cleared');
```

## Common Issues

### Issue: Build fails with "useSearchParams() should be wrapped in suspense"
**Solution**: ErrorBanner component is wrapped in Suspense - already fixed.

### Issue: Duplicate router declaration errors
**Solution**: Removed duplicate `const router = useRouter()` declarations - already fixed.

### Issue: API key not injected in requests
**Diagnosis**: Check network tab → Request headers → Look for X-API-Key
**Solution**: Verify request URL includes `/api/kyc/` pattern

### Issue: Guard redirects immediately
**Diagnosis**: API key might be expired or missing
**Solution**: Check sessionStorage for `kyc_api_key` and `kyc_api_key_expiry`

## Next Steps

### Recommended Testing
1. Manual testing with valid/invalid/expired keys
2. Cross-browser testing (Chrome, Firefox, Safari, Edge)
3. Mobile testing (iOS Safari, Chrome Mobile)
4. Network throttling tests (slow 3G)
5. Error recovery testing (dismiss banner → retry)

### Production Checklist
- [ ] Verify HTTPS is enabled (production only)
- [ ] Configure CORS for production domains
- [ ] Update allowedDomains for production URLs
- [ ] Enable rate limiting on TenantMiddleware
- [ ] Set up monitoring for authentication failures
- [ ] Document API key management for clients

## Support

For questions or issues, refer to:
- [KYC_API_KEY_INJECTION.md](./KYC_API_KEY_INJECTION.md) - Full implementation details
- [DOCUMENTATION_IMPLEMENTATION.md](./DOCUMENTATION_IMPLEMENTATION.md) - Domain whitelisting
- [STARTUP_GUIDE.md](./STARTUP_GUIDE.md) - Development setup
