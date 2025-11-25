import time
import trafilatura
from trafilatura.sitemaps import sitemap_search
from utils import logger, is_valid_url


def smart_chunk(text: str, chunk_size=500) -> list[str]:
    """
    Respects semantic boundaries.
    Splits by Paragraphs (\n\n) -> Sentences (. ) -> Characters.
    """
    if not text:
        return []

    chunks = []
    # split by paragraphs first (strongest delimiter)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    current_chunk = ""

    for para in paragraphs:
        # If adding this paragraph exceeds size, push current chunk and start new
        if len(current_chunk) + len(para) > chunk_size:
            if current_chunk:
                chunks.append(current_chunk.strip())

            # If the paragraph itself is massive, we must split it by sentence
            if len(para) > chunk_size:
                sentences = para.split(". ")
                current_chunk = ""
                for sent in sentences:
                    if len(current_chunk) + len(sent) > chunk_size:
                        chunks.append(current_chunk.strip())
                        current_chunk = sent + ". "
                    else:
                        current_chunk += sent + ". "
            else:
                current_chunk = para + "\n"  # Start new chunk with this paragraph
        else:
            current_chunk += para + "\n"

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


def crawl_website(base_url: str, limit: int = 15):
    """
    Generator function that yields processed chunks one by one.
    """
    logger.info(f"Starting crawl for {base_url}")

    # 1. Discovery
    urls = sitemap_search(base_url)
    if not urls:
        logger.warning("No sitemap found. Fallback to base URL.")
        urls = [base_url]

    # 2. Filtering
    valid_urls = [u for u in urls if is_valid_url(u, base_url)]
    logger.info(f"Found {len(urls)} URLs, {len(valid_urls)} valid.")

    # 3. Crawl Loop
    count = 0
    for link in valid_urls:
        if count >= limit:
            break

        try:
            # Etiquette: Sleep 0.5s between requests
            time.sleep(0.5)

            downloaded = trafilatura.fetch_url(link)
            if not downloaded:
                continue

            text = trafilatura.extract(downloaded, include_comments=False)
            if not text:
                continue

            chunks = smart_chunk(text)

            # Yield result to main app
            yield link, chunks
            count += 1

        except Exception as e:
            logger.error(f"Failed to crawl {link}: {e}")
            continue
