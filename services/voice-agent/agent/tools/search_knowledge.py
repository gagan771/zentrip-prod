from agent.rag.retriever import retrieve


async def search_knowledge(query: str) -> str:
    """Search Zentrip's private India-travel knowledge base."""
    return await retrieve(query)
