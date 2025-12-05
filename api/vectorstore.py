from typing import Any
import uuid
from pinecone import Pinecone, ServerlessSpec
from sentence_transformers import SentenceTransformer
from api.utils import logger


class VectorStoreManager:
    def __init__(self, api_key: str, index_name: str, region: str = "us-east-1"):
        self.pc = Pinecone(api_key=api_key)
        self.index_name = index_name
        self.embed_model = SentenceTransformer(
            "sentence-transformers/all-mpnet-base-v2"
        )
        self.dimension = 768

        existing_indexes = [i.name for i in self.pc.list_indexes()]

        if self.index_name not in existing_indexes:
            logger.info(f"Creating index {self.index_name}...")
            self.pc.create_index(
                name=self.index_name,
                dimension=self.dimension,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region=region),
            )
        self.index = self.pc.Index(self.index_name)

    def batch_upsert(self, data_buffer, namespace, batch_size=100):
        """
        Upserts vectors in chunks to avoid timeout.
        data_buffer: list of (text, source_url)
        """
        if not data_buffer:
            return

        # 1. Batch Embed (Much faster than 1-by-1)
        texts = [item["text"] for item in data_buffer]
        embeddings = self.embed_model.encode(texts)

        # 2. Prepare Vectors
        vectors = []
        for i, (item, vector) in enumerate(zip(data_buffer, embeddings)):
            vector_id = str(uuid.uuid4())
            metadata = {"text": item["text"], "source": item["source"]}
            vectors.append((vector_id, vector.tolist(), metadata))

        # 3. Batch Upload to Pinecone
        total_vectors = len(vectors)
        for i in range(0, total_vectors, batch_size):
            batch = vectors[i : i + batch_size]
            try:
                self.index.upsert(vectors=batch, namespace=namespace)
                logger.info(f"Upserted batch {i} to {i + len(batch)} into {namespace}")
            except Exception as e:
                logger.error(f"Upsert failed for batch {i}: {e}")

    def query_namespace(self, query_text, namespace, top_k=5) -> Any:
        query_vector = self.embed_model.encode(query_text).tolist()
        try:
            results = self.index.query(
                vector=query_vector,
                top_k=top_k,
                include_metadata=True,
                namespace=namespace,
            )
            return results
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return None

    def delete_namespace(self, namespace):
        """
        Nukes the entire namespace.
        Used before re-ingesting to prevent duplicates.
        """
        try:
            self.index.delete(delete_all=True, namespace=namespace)
            logger.info(f"NUKED namespace: {namespace}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete namespace {namespace}: {e}")
            return False
