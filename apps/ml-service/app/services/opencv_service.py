import base64
import logging
from typing import Any, Dict, Tuple

import cv2


class OpenCVService:
    def __init__(self) -> None:
        self.logger = logging.getLogger(__name__)
        self.cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def extract_face_from_document(self, img_path: str) -> Dict[str, Any]:
        try:
            self.logger.info("Extracting face from document: %s", img_path)
            image = cv2.imread(img_path)
            if image is None:
                return {
                    "success": False,
                    "face_found": False,
                    "face_base64": None,
                    "face_count": 0,
                    "message": "Invalid or unreadable image",
                }

            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)
            faces = self.cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30),
            )

            face_count = len(faces)
            if face_count == 0:
                return {
                    "success": False,
                    "face_found": False,
                    "face_base64": None,
                    "face_count": 0,
                    "message": "No face detected",
                }

            # choose largest face by area
            x, y, w, h = max(faces, key=lambda rect: rect[2] * rect[3])
            x, y, w, h = self._add_padding(image.shape, (x, y, w, h), padding_ratio=0.2)
            face_img = image[y : y + h, x : x + w]

            success, buffer = cv2.imencode(".jpg", face_img)
            if not success:
                return {
                    "success": False,
                    "face_found": True,
                    "face_base64": None,
                    "face_count": face_count,
                    "message": "Failed to encode face image",
                }

            face_b64 = base64.b64encode(buffer).decode("utf-8")
            return {
                "success": True,
                "face_found": True,
                "face_base64": face_b64,
                "face_count": face_count,
                "message": "Largest face extracted",
            }
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("Face extraction failed")
            return {
                "success": False,
                "face_found": False,
                "face_base64": None,
                "face_count": 0,
                "message": str(exc),
            }

    @staticmethod
    def _add_padding(
        shape: Tuple[int, int, int],
        bbox: Tuple[int, int, int, int],
        padding_ratio: float = 0.2,
    ) -> Tuple[int, int, int, int]:
        height, width, _ = shape
        x, y, w, h = bbox
        pad_w = int(w * padding_ratio)
        pad_h = int(h * padding_ratio)

        x_new = max(0, x - pad_w)
        y_new = max(0, y - pad_h)
        w_new = min(width - x_new, w + 2 * pad_w)
        h_new = min(height - y_new, h + 2 * pad_h)
        return x_new, y_new, w_new, h_new