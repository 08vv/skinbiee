FROM python:3.10-slim

# System deps for OpenCV + EasyOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY requirements-ml.txt .
RUN pip install --no-cache-dir -r requirements-ml.txt

# Copy the skin model
COPY models/ models/

# Copy the ML service itself
COPY ml_app.py .

# Configured for Hugging Face Space: added system dependencies for OpenCV/EasyOCR,
# single gunicorn worker, and extended timeout.

# Expose Hugging Face default port
EXPOSE 7860

# Single worker + extended timeout to stay within free-tier 16 GB RAM
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--timeout", "300", "ml_app:app"]
