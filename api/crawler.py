import time
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

    urls = sitemap_search(base_url)
    if not urls:
        urls = [base_url]

    valid_urls = [u for u in urls if is_valid_url(u, base_url)]

    count = 0
    for link in valid_urls:
        if count >= limit:
            break

        try:
            time.sleep(0.5)
            downloaded = trafilatura.fetch_url(link)

            result = trafilatura.bare_extraction(downloaded, include_comments=False)

            if not result or not result.get("text"):  # type: ignore
                continue

            page_title = result.get("title", "Unknown Page")  # type: ignore
            raw_text = result["text"]  # type: ignore

            text_chunks = smart_chunk(raw_text)

            contextualized_chunks = [
                f"Source: {page_title}\n\n{chunk}" for chunk in text_chunks
            ]

            yield link, contextualized_chunks
            count += 1

        except Exception as e:
            logger.error(f"Failed to crawl {link}: {e}")
            continue
