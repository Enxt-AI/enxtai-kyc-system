import logging

from deepface import DeepFace
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import face_extraction, face_verification, liveness

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


app = FastAPI(
    title="KYC ML Service",
    description="Machine Learning service for face verification and liveness detection",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(face_verification.router, tags=["Face Verification"])
app.include_router(face_extraction.router, tags=["Face Extraction"])
app.include_router(liveness.router, tags=["Liveness Detection"])


@app.get("/")
async def root():
    return {"message": "KYC ML Service is running"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ml-service",
        "version": "1.0.0",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):  # noqa: D401
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


@app.on_event("startup")
async def startup_event():
    logger.info("ML Service starting up...")
    try:
        # Trigger model download lazily
        DeepFace.build_model("ArcFace")
        logger.info("ArcFace model ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to warm up DeepFace model: %s", exc)
