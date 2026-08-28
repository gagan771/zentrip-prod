FROM python:3.12-slim-bookworm

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent ./agent
COPY prompts ./prompts
COPY knowledge ./knowledge
COPY scripts ./scripts

CMD ["python", "-m", "agent.main", "start"]
