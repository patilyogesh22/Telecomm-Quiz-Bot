FROM python:3.10-slim

WORKDIR /app

# Install only minimal build dependency (if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY backend/requirements.txt .

# Install Python dependencies without cache
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy only required folders
COPY backend ./backend
COPY frontend ./frontend

EXPOSE 5000

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "backend.app:app"]