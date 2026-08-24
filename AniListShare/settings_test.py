"""Settings used by the test suite.

pytest-django calls django.setup() from its own plugin hook — before any
conftest.py is imported — so the environment has to be pinned here, at import
time of the settings module itself. This gives the tests a known SECRET_KEY
(JWT signing needs one, and CI has no .env), SQLite instead of whatever
DATABASE_URL a developer has locally, and no HTTPS redirect. load_dotenv() in
settings.py does not override variables that already exist, so these win.
"""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-insecure-key")
os.environ["DATABASE_URL"] = ""
os.environ["DEBUG_MODE"] = "false"
os.environ["SECURE_SSL_REDIRECT"] = "false"

from . import settings as _base  # noqa: E402  (must follow the env setup above)

# Equivalent to `from .settings import *` without pulling the private names in
# with it: Django only ever reads the upper-case attributes of this module.
globals().update({name: value for name, value in vars(_base).items() if name.isupper()})

# Never touch the checked-out db.sqlite3, even if the fallback above changes.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
