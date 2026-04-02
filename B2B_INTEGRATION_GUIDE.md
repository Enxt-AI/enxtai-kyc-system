# EnxtAI KYC B2B Integration Guide

> Complete technical reference for partner FinTechs integrating the EnxtAI KYC engine into their proprietary applications. 

## 🔑 Authentication
All server-side integration requests require your organization's API key. You can generate this from your Client Portal dashboard.
API keys must be passed exactly as `X-API-Key` in the HTTP headers of every request.

```http
X-API-Key: kyc_live_xyz...
Content-Type: application/json
```

---

## 🏎️ Integration Flow (Server-To-Server)

The pure backend integration allows you to process documents transparently without redirecting your users to our UI. You manage your own UI and securely pipeline the data to our decision engine.

### 1. Initiate Session
Start a new session for a user by calling the `/v1/kyc/initiate` endpoint. This locks the verification request to their external ID.

**POST** `https://api.your-domain.com/api/v1/kyc/initiate`

**Request Payload:**
```json
{
  "externalUserId": "usr_998877",
  "email": "customer@fintech.com",
  "phone": "+919876543210"
}
```

**Response:**
```json
{
  "kycSessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "status": "PENDING"
}
```
*Save the `kycSessionId` against your user's database record to request status polling later.*

### 2. Upload Documents
You will sequentially execute multipart/form-data POST requests to our document listeners. Passing `externalUserId` binds the uploaded document to the active `PENDING` session.

**Endpoints:**
* `POST /v1/kyc/upload/pan`
* `POST /v1/kyc/upload/aadhaar/front` 
* `POST /v1/kyc/upload/aadhaar/back`
* `POST /v1/kyc/upload/live-photo`

**Example cURL (Upload PAN):**
```bash
curl -X POST https://api.your-domain.com/api/v1/kyc/upload/pan \
  -H "X-API-Key: your_live_api_key_here" \
  -F "externalUserId=usr_998877" \
  -F "file=@/var/tmp/pan-card-upload.jpg"
```
*Note: Ensure files do not exceed `5MB` and utilize `image/jpeg` or `image/png` formats.*

### 3. Check Status
Once the final document (the `live-photo`) is shipped, our OCR verification pipeline triggers automatically. You can retrieve the status and generated face match score securely via a standard GET.

**GET** `https://api.your-domain.com/api/v1/kyc/status/{kycSessionId}`

**Response Output:**
```json
{
  "kycSessionId": "a1b2c3d4-...",
  "externalUserId": "usr_998877",
  "status": "FACE_VERIFIED",
  "progress": 100,
  "extractedData": {
    "panNumber": "ABCDE1234F",
    "aadhaarNumber": "********9012",
    "fullName": "JOHN DOE",
    "dateOfBirth": "1990-01-01"
  },
  "verificationScores": {
    "faceMatchScore": 0.95,
    "livenessScore": 0.88
  }
}
```

---

## 🏓 Understanding Status Types

When checking a user's KYC pipeline state, expect the `status` enum string to dictate your next logical workflow action:

| Status | Meaning | Your Action |
| ------ | ------- | ----------- |
| `PENDING` | Session active, waiting for Docs. | Upload missing file streams |
| `OCR_COMPLETED` | Extracted Text, processing Face match. | Retry polling in 2s |
| `FACE_VERIFIED` | Auto-Approved. | Unlock user onboarding 🚀 |
| `MANUAL_REVIEW` | Borderline FaceMatch (<0.6). | Wait for FinTech Admin Approval |
| `REJECTED` | Document failure. | Request the user to retry the flow | 

---

## ✨ SDK Wrapper Considerations
If you are planning to distribute this SDK directly inside a React-Native, iOS, or Android environment, ensure your API secret proxy is securely bundled. **Do not embed raw `X-API-Key` strings into client-distributed applications.** Proxies must be used for client-originating uploads.
