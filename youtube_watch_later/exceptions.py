# exceptions.py


class YouTubeWatchLaterError(Exception):
    """Classe de base pour les exceptions de l'application."""

    def __init__(self, message: str = "", error_code: str = None):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class PlaylistError(YouTubeWatchLaterError):
    """Erreur lors de la gestion des playlists."""

    def __init__(self, message: str = "Erreur de playlist"):
        super().__init__(message, "PLAYLIST_ERROR")


class SSLError(YouTubeWatchLaterError):
    """Erreur SSL."""

    def __init__(self, message: str = "Erreur SSL"):
        super().__init__(message, "SSL_ERROR")


class AuthenticationError(YouTubeWatchLaterError):
    """Erreur lors de l'authentification."""

    def __init__(self, message: str = "Erreur d'authentification"):
        super().__init__(message, "AUTH_ERROR")


class QuotaExceededError(YouTubeWatchLaterError):
    """Erreur lorsque le quota API est dépassé."""

    def __init__(self, message: str = "Quota API dépassé"):
        super().__init__(message, "QUOTA_EXCEEDED")


class ConfigurationError(YouTubeWatchLaterError):
    """Erreur de configuration."""

    def __init__(self, message: str = "Erreur de configuration"):
        super().__init__(message, "CONFIG_ERROR")


class APIError(YouTubeWatchLaterError):
    """Erreur lors des appels API."""

    def __init__(self, message: str = "Erreur API", status_code: int = None):
        self.status_code = status_code
        super().__init__(message, "API_ERROR")


class VideoError(YouTubeWatchLaterError):
    """Erreur lors de la gestion des vidéos."""

    def __init__(self, message: str = "Erreur de vidéo"):
        super().__init__(message, "VIDEO_ERROR")


class ChannelError(YouTubeWatchLaterError):
    """Erreur lors de la gestion des chaînes."""

    def __init__(self, message: str = "Erreur de chaîne"):
        super().__init__(message, "CHANNEL_ERROR")


class StatisticsError(YouTubeWatchLaterError):
    """Erreur lors de la gestion des statistiques."""

    def __init__(self, message: str = "Erreur de statistiques"):
        super().__init__(message, "STATS_ERROR")


class DatabaseError(YouTubeWatchLaterError):
    """Erreur lors de l'accès aux données."""

    def __init__(self, message: str = "Erreur de base de données"):
        super().__init__(message, "DB_ERROR")


class ValidationError(YouTubeWatchLaterError):
    """Erreur de validation des données."""

    def __init__(self, message: str = "Erreur de validation"):
        super().__init__(message, "VALIDATION_ERROR")


class SchedulerError(YouTubeWatchLaterError):
    """Erreur du planificateur de tâches."""

    def __init__(self, message: str = "Erreur du planificateur"):
        super().__init__(message, "SCHEDULER_ERROR")


class NetworkError(YouTubeWatchLaterError):
    """Erreur réseau."""

    def __init__(self, message: str = "Erreur réseau"):
        super().__init__(message, "NETWORK_ERROR")


class QuotaExceededError(Exception):
    """Exception levée quand le quota API est dépassé."""

    pass


class WatchedVideoError(Exception):
    """Exception levée lors d'erreurs de traitement des vidéos regardées."""

    pass


class StatsSyncError(Exception):
    """Exception levée lors d'erreurs de synchronisation des statistiques."""

    pass


def handle_youtube_error(error):
    """Gère les erreurs de l'API YouTube et les convertit en exceptions personnalisées."""
    if isinstance(error, Exception):
        if hasattr(error, "resp") and hasattr(error.resp, "status"):
            status = error.resp.status

            if status == 401:
                raise AuthenticationError("Authentification invalide ou expirée")
            elif status == 403:
                if "quotaExceeded" in str(error):
                    raise QuotaExceededError()
                raise APIError("Accès refusé", status)
            elif status == 404:
                raise APIError("Ressource introuvable", status)
            elif status >= 500:
                raise APIError(f"Erreur serveur YouTube (Code: {status})", status)

        raise APIError(str(error))
