FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir apscheduler Pillow pydantic psycopg[binary] python-dotenv requests

COPY .env .env
COPY *.py ./
COPY tests/ tests/

EXPOSE 5055

CMD ["python", "main.py"]
