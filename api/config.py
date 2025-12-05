import os
import sys
import logging
from api.vectorstore import VectorStoreManager
from dotenv import load_dotenv
from google import genai

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)

load_dotenv()

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "")
INDEX_NAME = "ragbot"


def log_critical(api_key: str):
    logger.critical(f"CRITICAL: {api_key} is missing from .env")
    sys.exit(1)


if not GOOGLE_API_KEY:
    log_critical("GOOGLE_API_KEY")

if not PINECONE_API_KEY:
    log_critical("PINECONE_API_KEY")


def system_instruction(url: str, context: str):
    return f"""
    INSTRUCTION:
    You are a helpful assistant for the website: {url}.  
    Answer only using the provided context below.  
    If the information is missing, reply: "Sorry, I haven't read that information yet."  
    Limit every answer to five sentences.

    CONTEXT:
    {context}
    """


try:
    vs = VectorStoreManager(api_key=PINECONE_API_KEY, index_name=INDEX_NAME)
    flash = genai.Client()
    logger.info("✅ System initialized: Pinecone & Gemini ready.")
except Exception as e:
    logger.critical(f"Startup Failure: {e}")
    sys.exit(1)
