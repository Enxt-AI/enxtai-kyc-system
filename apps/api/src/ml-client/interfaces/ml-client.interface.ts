export interface FaceVerificationResult {
  verified: boolean;
  confidence: number;
  distance: number;
  model: string;
  threshold: number;
}

export interface FaceExtractionResult {
  success: boolean;
  face_found: boolean;
  face_base64: string | null;
  face_count: number;
  message: string;
}

export interface LivenessDetectionResult {
  is_live: boolean;
  confidence: number;
  method: string;
  message: string;
}

export interface FaceVerificationWorkflowResult {
  verified: boolean;
  faceMatchScore: number;
  livenessScore: number;
  faceExtractionSuccess: boolean;
  documentUsed: 'PAN' | 'AADHAAR';
}
