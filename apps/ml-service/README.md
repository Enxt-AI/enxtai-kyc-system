# KYC ML Service

FastAPI service that will host face verification and liveness detection endpoints using DeepFace and OpenCV.

## Endpoints

- `GET /` health banner (running)
- `GET /health` health probe
- Future releases will add:
  - Face match endpoint
  - Liveness detection endpoint
  - Feature extraction utilities

## Local Setup

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Notes

- The first DeepFace call downloads required models; allow extra time on first run.
- System dependencies for OpenCV are pre-installed in the Docker image.
