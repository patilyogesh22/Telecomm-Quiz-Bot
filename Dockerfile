FROM python:3.10-slim

WORKDIR /app

# Install minimal dependencies only if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first (better caching)
COPY backend/requirements.txt .

# Upgrade pip and install dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy only required folders
COPY backend ./backend
COPY frontend ./frontend

# Expose port
EXPOSE 5000

# Run with production server
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "backend.app:app"]