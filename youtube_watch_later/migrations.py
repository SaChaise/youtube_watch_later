import json
import os
import logging
from datetime import datetime
from typing import Dict, Any, List
from config import Config

logger = logging.getLogger(__name__)


class Migration:
    """Gère les migrations de données."""

    def __init__(self, statistics_file: str):
        self.statistics_file = statistics_file
        self.migrations: List[Dict[str, Any]] = [
            {
                "version": 1,
                "description": "Structure initiale des statistiques",
                "function": self._migrate_v1,
            },
            {
                "version": 2,
                "description": "Ajout du suivi du quota API",
                "function": self._migrate_v2,
            },
            {
                "version": 3,
                "description": "Ajout de l'historique des vidéos",
                "function": self._migrate_v3,
            },
        ]

    def _get_current_version(self, data: Dict) -> int:
        """Récupère la version actuelle des données."""
        return data.get("version", 0)

    def _save_data(self, data: Dict):
        """Sauvegarde les données avec backup."""
        # Créer un backup avant la migration
        if os.path.exists(self.statistics_file):
            backup_file = (
                f"{self.statistics_file}.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            )
            try:
                with open(self.statistics_file, "r", encoding="utf-8") as src:
                    with open(backup_file, "w", encoding="utf-8") as dst:
                        dst.write(src.read())
            except Exception as e:
                logger.error(f"Erreur lors de la création du backup: {str(e)}")

        # Sauvegarder les nouvelles données
        try:
            with open(self.statistics_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Erreur lors de la sauvegarde des données: {str(e)}")
            raise

    def _migrate_v1(self, data: Dict) -> Dict:
        """Migration vers la version 1: Structure initiale."""
        return {
            "version": 1,
            "total_videos": 0,
            "total_watch_time": 0,
            "videos_by_month": {},
            "daily_stats": {},
            "selected_channels": 0,
            "last_check": datetime.now().isoformat(),
        }

    def _migrate_v2(self, data: Dict) -> Dict:
        """Migration vers la version 2: Ajout du suivi du quota."""
        data["quota_usage"] = {
            "used": 0,
            "limit": Config.YOUTUBE_QUOTA_LIMIT,
            "reset_date": datetime.now().isoformat(),
        }
        data["version"] = 2
        return data

    def _migrate_v3(self, data: Dict) -> Dict:
        """Migration vers la version 3: Ajout de l'historique des vidéos."""
        data["video_history"] = []
        data["version"] = 3
        return data

    def run(self):
        """Exécute les migrations nécessaires."""
        try:
            # Charger les données existantes ou créer une nouvelle structure
            try:
                with open(self.statistics_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                data = {}

            current_version = self._get_current_version(data)

            # Appliquer les migrations nécessaires
            for migration in self.migrations:
                if migration["version"] > current_version:
                    logger.info(
                        f"Application de la migration v{migration['version']}: {migration['description']}"
                    )
                    try:
                        data = migration["function"](data)
                        self._save_data(data)
                        logger.info(f"Migration v{migration['version']} réussie")
                    except Exception as e:
                        logger.error(
                            f"Erreur lors de la migration v{migration['version']}: {str(e)}"
                        )
                        raise

            return data

        except Exception as e:
            logger.error(f"Erreur lors des migrations: {str(e)}")
            raise


def run_migrations():
    """Fonction utilitaire pour exécuter les migrations."""
    try:
        migration = Migration(Config.STATISTICS_FILE)
        migration.run()
        logger.info("Migrations terminées avec succès")
    except Exception as e:
        logger.error(f"Erreur lors de l'exécution des migrations: {str(e)}")
        raise
