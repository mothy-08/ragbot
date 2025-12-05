import time

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from api.utils import get_namespace_id, logger
from api.crawler import crawl_website
from api.schemas import ChatRequest, IngestRequest
from api.config import vs, flash, system_instruction
from google.genai import types

app = FastAPI(title="RAG Chatbot API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def background_ingest_task(url: str, namespace_id: str):
    logger.info(f"Background crawl STARTED for: {url}")
    start = time.perf_counter()
    try:
        crawler_gen = crawl_website(url, limit=50)

        buffer = []
        for source_url, chunks in crawler_gen:
            for chunk in chunks:
                buffer.append({"text": chunk, "source": source_url})

                if len(buffer) >= 50:
                    vs.batch_upsert(buffer, namespace_id)
                    buffer = []

        if buffer:
            vs.batch_upsert(buffer, namespace_id)

        logger.info(f"Background crawl COMPLETED for {namespace_id}")
    except Exception as e:
        logger.error(f"Background task failed for {url}: {e}")

    end = time.perf_counter()
    logger.info(f"Time elapsed: {end - start}")


@app.get("/")
def check_health():
    return {"status": "online", "system": "RAG-Chatbot v1.0"}


@app.post("/check")
def check_endpoint(req: IngestRequest):
    url_str = str(req.url)
    namespace_id = get_namespace_id(url_str)

    try:
        stats = vs.index.describe_index_stats()
        exists = namespace_id in stats.namespaces

        count = 0
        if exists:
            count = stats.namespaces[namespace_id].vector_count

        return {
            "exists": exists and count > 0,
            "namespace": namespace_id,
            "vector_count": count,
        }
    except Exception as e:
        logger.error(f"Check failed: {e}")
        return {"exists": False, "error": str(e)}


@app.post("/ingest")
def ingest_endpoint(req: IngestRequest, background_tasks: BackgroundTasks):
    url_str = str(req.url)
    namespace_id = get_namespace_id(url_str)

    background_tasks.add_task(background_ingest_task, url_str, namespace_id)
    logger.info(f"Background ingest dispatched: {url_str} -> {namespace_id}")

    return {
        "status": "processing",
        "message": "Ingestion started in background.",
        "namespace": namespace_id,
    }


# Add this near your other endpoints
@app.post("/reset")
def reset_endpoint(req: IngestRequest):
    url_str = str(req.url)
    namespace_id = get_namespace_id(url_str)

    success = vs.delete_namespace(namespace_id)

    if success:
        return {"status": "success", "message": f"Memory wiped for {url_str}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to delete namespace")


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    url_str = str(req.url)
    namespace_id = get_namespace_id(url_str)

    # 1. Retrieval
    results = vs.query_namespace(req.message, namespace_id)

    contexts = []
    sources = set()

    logger.info(f"\n--- DEBUG: RETRIEVED FOR '{req.message}' ---")
    if results and results.matches:
        for i, match in enumerate(results.matches):
            logger.info(
                f"[{i}] Score: {match.score:.4f} | Text: {match.metadata.get('text', '')[:100]}..."
            )
            if match.metadata:
                text = match.metadata.get("text", "")
                src = match.metadata.get("source", None)
                if text:
                    contexts.append(text)
                if src:
                    sources.add(src)

    if not contexts:
        return {
            "answer": "I haven't learned this website yet. Please click 'Train' first!",
            "sources": [],
        }

    # 2. Prompting
    context = "\n\n".join(contexts[:5])

    try:
        response = flash.models.generate_content(
            model="gemini-2.0-flash",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction(url_str, context)
            ),
            contents=req.message,
        )
        return {"answer": response.text, "sources": list(sources)}
    except Exception as e:
        logger.error(f"LLM Error: {e}")
        raise HTTPException(status_code=500, detail="AI Service Error")
