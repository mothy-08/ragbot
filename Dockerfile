FROM python:3.10-slim

# 1. Environment Config
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Explicitly set where models get saved so we can control permissions
    HF_HOME="/home/user/.cache/huggingface"

# 2. Security: Create Non-Root User
RUN useradd -m -u 1000 user
WORKDIR /app

# 3. Install Dependencies (As Root)
COPY --chown=user ./requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# 4. PREPARE CACHE (Critical Fix)
# We create the directory and give 'user' ownership BEFORE switching users.
# This prevents "Permission Denied" errors at runtime.
RUN mkdir -p $HF_HOME && chown -R user:user $HF_HOME

# 5. SWITCH TO USER
# We switch users NOW so that the model download is owned by 'user', not 'root'.
USER user

# 6. DOWNLOAD MODEL (Memory Safe Fix)
# We use 'snapshot_download' instead of 'SentenceTransformer()'.
# This downloads the files to disk WITHOUT loading them into RAM (avoids OOM crashes).
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('sentence-transformers/all-mpnet-base-v2')"

# 7. Copy Code
# Since we are already 'user', we use --chown just to be safe.
COPY --chown=user . .

# 8. Runtime Config
ENV PATH="/home/user/.local/bin:$PATH"

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "7860"]
