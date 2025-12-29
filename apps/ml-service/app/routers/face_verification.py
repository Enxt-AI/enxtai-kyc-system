import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.models.schemas import ErrorResponse, FaceVerificationResponse
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
    "/api/verify-face",
    response_model=FaceVerificationResponse,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorResponse},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"model": ErrorResponse},
    },
)
async def verify_face(
    live_photo: Annotated[UploadFile, File(...)],
    document_photo: Annotated[UploadFile, File(...)],
    service: DeepFaceService = Depends(get_deepface_service),
):
    _validate_image(live_photo)
    _validate_image(document_photo)

    live_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    doc_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    try:
        logger.info("Received files for verification: %s, %s", live_photo.filename, document_photo.filename)
        live_content = await live_photo.read()
        doc_content = await document_photo.read()
        live_tmp.write(live_content)
        doc_tmp.write(doc_content)
        live_tmp.close()
        doc_tmp.close()

        result = service.verify_faces(live_tmp.name, doc_tmp.name)
        if result.get("error"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Verification failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    finally:
        for path in (live_tmp.name, doc_tmp.name):
            try:
                os.unlink(path)
            except OSError:
                logger.warning("Failed to remove temp file: %s", path)