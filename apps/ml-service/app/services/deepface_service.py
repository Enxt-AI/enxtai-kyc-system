import logging
from typing import Any, Dict

import cv2
from deepface import DeepFace


class DeepFaceService:
    MODEL_NAME = "ArcFace"
    DETECTOR_BACKEND = "opencv"
    BLUR_THRESHOLD = 100.0

    def __init__(self) -> None:
        self.logger = logging.getLogger(__name__)

    def verify_faces(self, img1_path: str, img2_path: str) -> Dict[str, Any]:
        try:
            self.logger.info("Verifying faces using %s", self.MODEL_NAME)
            result = DeepFace.verify(
                img1_path=img1_path,
                img2_path=img2_path,
                model_name=self.MODEL_NAME,
                detector_backend=self.DETECTOR_BACKEND,
            )
            distance = float(result.get("distance", 1.0))
            threshold = float(result.get("threshold", 0.0))
            confidence = max(0.0, 1.0 - distance)
            return {
                "verified": bool(result.get("verified", False)),
                "confidence": confidence,
                "distance": distance,
                "model": self.MODEL_NAME,
                "threshold": threshold,
            }
        except ValueError as exc:
            self.logger.warning("No face detected during verification: %s", exc)
            return {
                "verified": False,
                "confidence": 0.0,
                "error": "No face detected",
                "distance": 1.0,
                "model": self.MODEL_NAME,
                "threshold": 0.0,
            }
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("Face verification failed")
            return {
                "verified": False,
                "confidence": 0.0,
                "error": str(exc),
                "distance": 1.0,
                "model": self.MODEL_NAME,
                "threshold": 0.0,
            }

    def detect_liveness(self, img_path: str) -> Dict[str, Any]:
        try:
            self.logger.info("Running liveness heuristics")
            faces = DeepFace.extract_faces(img_path=img_path, detector_backend=self.DETECTOR_BACKEND)
            face_count = len(faces)
            if face_count == 0:
                return {
                    "is_live": False,
                    "confidence": 0.0,
                    "method": "basic_quality_check",
                    "message": "No face detected",
                }

            image = cv2.imread(img_path)
            if image is None:
                return {
                    "is_live": False,
                    "confidence": 0.0,
                    "method": "basic_quality_check",
                    "message": "Invalid image",
                }

            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            blur = cv2.Laplacian(gray, cv2.CV_64F).var()
            brightness = float(gray.mean())

            blur_score = min(1.0, blur / self.BLUR_THRESHOLD)
            brightness_score = 1.0 if 60 <= brightness <= 200 else 0.0
            confidence = (blur_score + brightness_score) / 2.0

            is_live = blur > self.BLUR_THRESHOLD * 0.5 and brightness_score > 0
            message = "Liveness indicators passed" if is_live else "Liveness indicators weak"

            return {
                "is_live": is_live,
                "confidence": round(confidence, 2),
                "method": "basic_quality_check",
                "message": message,
            }
        except Exception as exc:  # noqa: BLE001
            self.logger.exception("Liveness detection failed")
            return {
                "is_live": False,
                "confidence": 0.0,
                "method": "basic_quality_check",
                "message": str(exc),
            }