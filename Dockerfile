FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN useradd -m -u 1000 user

WORKDIR /app

COPY --chown=user ./requirements.txt requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

RUN pip install --no-cache-dir \
    torch \
    sentence-transformers \
    --index-url https://download.pytorch.org/whl/cpu

COPY --chown=user . .

USER user

ENV PATH="/home/user/.local/bin:$PATH"

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "7860"]
