FROM python:3.10-slim

WORKDIR /app

# Prevent python from creating cache
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install minimal dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY backend ./backend
COPY frontend ./frontend

EXPOSE 5000

# Production server
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]