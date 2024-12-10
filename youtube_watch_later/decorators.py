import ssl
import time
from functools import wraps
import logging

logger = logging.getLogger(__name__)


def handle_ssl_error(func):
    """Décorateur pour gérer les erreurs SSL avec retries."""

    @wraps(func)
    def wrapper(self, *args, **kwargs):
        max_retries = 3
        retry_delay = 1

        for attempt in range(max_retries):
            try:
                return func(self, *args, **kwargs)
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Erreur SSL (tentative {attempt + 1}/{max_retries}): {str(e)}"
                    )
                    time.sleep(retry_delay * (attempt + 1))
                    try:
                        if hasattr(self, "authenticate"):
                            self.authenticate()
                    except:
                        pass
                else:
                    raise
        return func(self, *args, **kwargs)

    return wrapper
