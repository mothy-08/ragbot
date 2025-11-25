# 🤖 RAGBot

A cloud-native, multi-tenant AI chatbot that instantly learns the content of any website and answers questions in real-time. Built for the Cloud Computing final project.

## 🚀 Key Features

* **Universal Ingestion:** Crawls and indexes any provided URL (e.g., University sites, NGOs, Government portals) on-demand.
* **SaaS Architecture:** Uses **Multi-Tenancy** via Vector Database Namespacing to isolate customer data within a single index.
* **RAG Pipeline:** Combines **Semantic Search** (Pinecone) with **LLM Generation** (Gemini 2.0 Flash) for hallucination-free answers.
* **Client-Server Model:** Decoupled FastAPI Backend and Chrome Extension Frontend.
* **Asynchronous Processing:** Background workers handle heavy scraping tasks without blocking the UI.

## 🛠️ Tech Stack

### **Backend (Cloud Engine)**
* **Framework:** FastAPI (Python)
* **Vector Database:** Pinecone (Serverless AWS)
* **LLM:** Google Gemini 2.0 Flash
* **Crawler:** Trafilatura (Sitemap & Content Discovery)
* **Embeddings:** Sentence-Transformers (`all-MiniLM-L6-v2`)

### **Frontend (Client)**
* **Interface:** Google Chrome Extension (Manifest V3)
* **Interaction:** Real-time Polling & Dynamic UI

## 📂 Project Structure

```bash
ragbot/
├── api/                    # 🐍 Backend Logic
│   ├── server.py           # Main FastAPI entry point
│   ├── crawler.py          # Logic for sitemap parsing & scraping
│   ├── vectorstore.py      # Pinecone batching & management
│   ├── config.py           # Environment & Logging setup
│   ├── utils.py            # Security & URL validation
│   ├── schemas.py          # Pydantic data models
│   └── requirements.txt    # Python Dependencies
├── extension/              # 🧩 Frontend Client
│   ├── manifest.json
│   ├── popup.html
│   └── popup.js
└── README.md               # Documentation
