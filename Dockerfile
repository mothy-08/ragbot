FROM python:3.10-slim

# 1. Environment Config
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Accelerate model download by not caching the zip file, just the unzipped model
    PIP_NO_CACHE_DIR=1

# 2. Security: Create Non-Root User
RUN useradd -m -u 1000 user
WORKDIR /app

# 3. Install Dependencies
# We install Torch CPU first to avoid the massive GPU bloat
COPY --chown=user ./requirements.txt requirements.txt
RUN pip install --upgrade pip && \
    pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# 4. PRE-DOWNLOAD THE MODEL (The "Bulletproof" Fix)
# We run a one-line Python script to download the model into the image cache.
# This ensures the Space creates the index instantly on startup.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-mpnet-base-v2')"

# 5. Copy Code
COPY --chown=user . .

# 6. Runtime Config
USER user
ENV PATH="/home/user/.local/bin:$PATH"

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "7860"]
