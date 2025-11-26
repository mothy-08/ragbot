import time
import re
import requests
import trafilatura
from trafilatura.sitemaps import sitemap_search
from api.utils import logger, is_valid_url


def smart_chunk(text: str, chunk_size=1000, overlap=100) -> list[str]:
    if not text:
        return []

    chunks = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) > chunk_size:
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = current_chunk[-overlap:] + "\n" + para + "\n"
            else:
                chunks.append(para[:chunk_size])
                current_chunk = ""
        else:
            current_chunk += para + "\n"

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


def crawl_website(base_url: str, limit: int = 25):
    logger.info(f"Starting crawl for {base_url}")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        urls = sitemap_search(base_url)
    except Exception:
        urls = []

    if not urls:
        logger.warning("No sitemap found (or blocked). Fallback to base URL.")
        urls = [base_url]

    valid_urls = [u for u in urls if is_valid_url(u, base_url)]
    logger.info(f"Found {len(urls)} URLs, {len(valid_urls)} valid.")

    count = 0
    for link in valid_urls:
        if count >= limit:
            break

        try:
            time.sleep(1.0)
            response = requests.get(link, headers=headers, timeout=10)

            if response.status_code != 200:
                logger.warning(f"Blocked or missing ({response.status_code}): {link}")
                continue

            # --- ROBUST EXTRACTION STRATEGY ---
            page_title = "Unknown Page"
            raw_text = ""

            # Attempt 1: Bare Extraction (Best Quality)
            try:
                result = trafilatura.bare_extraction(
                    response.text, include_comments=False
                )
                if result and isinstance(result, dict) and result.get("text"):
                    page_title = result.get("title", "Unknown Page")
                    raw_text = result["text"]
            except Exception:
                # If trafilatura crashes (AttributeError, etc.), fail silently and try fallback
                logger.warning(
                    f"Metadata extraction failed for {link}, using fallback."
                )
                pass

            # Attempt 2: Fallback Extraction (If Attempt 1 failed)
            if not raw_text:
                raw_text = trafilatura.extract(response.text, include_comments=False)

                # Manual Title Extraction via Regex (since bare_extraction failed)
                if raw_text:
                    title_match = re.search(
                        r"<title>(.*?)</title>",
                        response.text,
                        re.IGNORECASE | re.DOTALL,
                    )
                    if title_match:
                        clean_title = title_match.group(1).strip()
                        if clean_title:
                            page_title = clean_title

            if not raw_text:
                continue

            # Chunking and Context Injection
            text_chunks = smart_chunk(raw_text)

            contextualized_chunks = [
                f"Source: {page_title}\n\n{chunk}" for chunk in text_chunks
            ]

            yield link, contextualized_chunks
            count += 1

        except Exception as e:
            logger.error(f"Failed to crawl {link}: {e}")
            continue
