import os

# Force a deterministic test environment before settings.py loads .env:
# a known SECRET_KEY (JWT signing needs one) and the SQLite path (never a
# real DATABASE_URL). load_dotenv() does not override existing env vars.
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-insecure-key")
os.environ["DATABASE_URL"] = ""
os.environ["DEBUG_MODE"] = "false"
os.environ["SECURE_SSL_REDIRECT"] = "false"

