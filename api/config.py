import os
import sys
import logging
from dotenv import load_dotenv
from api.vectorstore import VectorStoreManager
import google.generativeai as genai

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

load_dotenv()

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
INDEX_NAME = "production-rag-bot"


def log_critical(api_key: str):
    logger.critical(f"CRITICAL: {api_key} is missing from .env")
    sys.exit(1)


if not GOOGLE_API_KEY:
    log_critical("PINECONE_API_KEY")

if not PINECONE_API_KEY:
    log_critical("PINECONE_API_KEY")


try:
    vs = VectorStoreManager(api_key=PINECONE_API_KEY, index_name=INDEX_NAME)

    genai.configure(api_key=GOOGLE_API_KEY)  # type: ignore
    flash = genai.GenerativeModel("gemini-2.0-flash")  # type: ignore

    logger.info("✅ System initialized: Pinecone & Gemini ready.")
except Exception as e:
    logger.critical(f"Startup Failure: {e}")
    sys.exit(1)
