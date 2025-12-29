import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.models.schemas import ErrorResponse, LivenessDetectionResponse
from app.services.deepface_service import DeepFaceService


router = APIRouter()
logger = logging.getLogger(__name__)


def get_deepface_service() -> DeepFaceService:
    return DeepFaceService()


def _validate_image(file: UploadFile) -> None:
    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Only JPEG and PNG are allowed.",
        )


@router.post(
    "/api/detect-liveness",
    response_model=LivenessDetectionResponse,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorResponse},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"model": ErrorResponse},
    },
)
async def detect_liveness(
    photo: Annotated[UploadFile, File(...)],
    service: DeepFaceService = Depends(get_deepface_service),
):
    _validate_image(photo)

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    try:
        logger.info("Received photo for liveness detection: %s", photo.filename)
        content = await photo.read()
        tmp_file.write(content)
        tmp_file.close()

        result = service.detect_liveness(tmp_file.name)
        if result.get("message") == "No face detected":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Liveness detection failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    finally:
        try:
            os.unlink(tmp_file.name)
        except OSError:
            logger.warning("Failed to remove temp file: %s", tmp_file.name)