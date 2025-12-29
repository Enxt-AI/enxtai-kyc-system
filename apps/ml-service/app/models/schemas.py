from pydantic import BaseModel, ConfigDict, Field


class FaceVerificationResponse(BaseModel):
    verified: bool = Field(..., description="Whether the faces match")
    confidence: float = Field(..., description="Confidence score (1 - distance)")
    distance: float = Field(..., description="Embedding distance between faces")
    model: str = Field(..., description="DeepFace model used")
    threshold: float = Field(..., description="Model threshold for verification")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "verified": True,
                "confidence": 0.92,
                "distance": 0.08,
                "model": "ArcFace",
                "threshold": 0.35,
            }
        }
    )


class FaceExtractionResponse(BaseModel):
    success: bool = Field(..., description="Whether extraction succeeded")
    face_found: bool = Field(..., description="If at least one face was detected")
    face_base64: str | None = Field(None, description="Base64 encoded cropped face")
    face_count: int = Field(..., description="Number of faces detected")
    message: str = Field(..., description="Informational message")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "face_found": True,
                "face_base64": "<base64-string>",
                "face_count": 1,
                "message": "Largest face extracted",
            }
        }
    )


class LivenessDetectionResponse(BaseModel):
    is_live: bool = Field(..., description="Whether the face appears live")
    confidence: float = Field(..., description="Heuristic confidence score")
    method: str = Field(..., description="Detection method used")
    message: str = Field(..., description="Informational message")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "is_live": True,
                "confidence": 0.78,
                "method": "basic_quality_check",
                "message": "Liveness indicators passed",
            }
        }
    )


class ErrorResponse(BaseModel):
    error: str = Field(..., description="Short error message")
    detail: str = Field(..., description="Detailed error information")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": "Invalid file type",
                "detail": "Only JPEG and PNG images are supported.",
            }
        }
    )