import logging
import os
import tempfile
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.models.schemas import ErrorResponse, FaceExtractionResponse
from app.services.opencv_service import OpenCVService


router = APIRouter()
logger = logging.getLogger(__name__)


def get_opencv_service() -> OpenCVService:
    return OpenCVService()


def _validate_image(file: UploadFile) -> None:
    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Only JPEG and PNG are allowed.",
        )


@router.post(
    "/api/extract-face",
    response_model=FaceExtractionResponse,
    status_code=status.HTTP_200_OK,
    responses={
        status.HTTP_400_BAD_REQUEST: {"model": ErrorResponse},
        status.HTTP_500_INTERNAL_SERVER_ERROR: {"model": ErrorResponse},
    },
)
async def extract_face(
    document: Annotated[UploadFile, File(...)],
    service: OpenCVService = Depends(get_opencv_service),
):
    _validate_image(document)

    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    try:
        logger.info("Received document for face extraction: %s", document.filename)
        content = await document.read()
        tmp_file.write(content)
        tmp_file.close()

        result = service.extract_face_from_document(tmp_file.name)
        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.get("message", "Face extraction failed"),
            )
        return result
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Face extraction failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    finally:
        try:
            os.unlink(tmp_file.name)
        except OSError:
            logger.warning("Failed to remove temp file: %s", tmp_file.name)