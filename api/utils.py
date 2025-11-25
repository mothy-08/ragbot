import hashlib
import re
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def get_namespace_id(url: str) -> str:
    """
    Generates a collision-resistant namespace ID.
    Format: clean_name_MD5hash
    """
    clean_name = re.sub(r"https?://(www\.)?", "", url)
    clean_name = re.sub(r"[^a-zA-Z0-9]", "_", clean_name)
    clean_name = clean_name.strip("_")[:30]

    url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()[:6]

    return f"{clean_name}_{url_hash}"


def is_valid_url(url: str, base_domain: str) -> bool:
    """
    Enforces strict crawl scope.
    """
    try:
        parsed = urlparse(url)
        base_parsed = urlparse(base_domain)

        # 1. Scheme Check
        if parsed.scheme not in ["http", "https"]:
            return False

        # 2. Strict Domain Check (Ends with pattern to prevent 'google.com.evil.com')
        # We allow subdomains (e.g. portal.batstateu.edu.ph)
        if not parsed.netloc.endswith(base_parsed.netloc):
            return False

        # 3. File Extension Check
        ignored_exts = [
            ".pdf",
            ".jpg",
            ".png",
            ".gif",
            ".css",
            ".js",
            ".docx",
            ".xlsx",
            ".xml",
            ".zip",
            ".rar",
            ".mp4",
        ]
        if any(parsed.path.lower().endswith(ext) for ext in ignored_exts):
            return False

        return True
    except Exception:
        return False
