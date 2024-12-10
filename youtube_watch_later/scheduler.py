import threading
import time
from datetime import datetime, timedelta
import logging
from typing import List, Callable, Dict, Optional
import json


class TaskScheduler:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.tasks: Dict[str, Dict] = {}
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.check_hours: List[int] = []
        self._lock = threading.Lock()
        self.last_run_times: Dict[str, datetime] = {}

    def add_task(self, task_id: str, func: Callable, description: str = ""):
        """Ajoute une tâche au planificateur."""
        with self._lock:
            self.tasks[task_id] = {
                "function": func,
                "description": description,
                "last_run": None,
            }
            self.logger.info(f"Tâche ajoutée: {task_id} - {description}")

    def remove_task(self, task_id: str):
        """Supprime une tâche du planificateur."""
        with self._lock:
            if task_id in self.tasks:
                del self.tasks[task_id]
                self.logger.info(f"Tâche supprimée: {task_id}")

    def set_check_hours(self, hours: List[int]):
        """Définit les heures de vérification."""
        with self._lock:
            self.check_hours = sorted(list(set(hours)))
            self._save_check_hours()
            self.logger.info(f"Heures de vérification mises à jour: {self.check_hours}")

    def _save_check_hours(self):
        """Sauvegarde les heures de vérification dans un fichier."""
        try:
            with open("check_hours.json", "w") as f:
                json.dump(self.check_hours, f)
        except Exception as e:
            self.logger.error(f"Erreur lors de la sauvegarde des heures: {str(e)}")

    def _load_check_hours(self):
        """Charge les heures de vérification depuis le fichier."""
        try:
            with open("check_hours.json", "r") as f:
                self.check_hours = json.load(f)
        except FileNotFoundError:
            self.check_hours = [9, 12, 15, 18, 21]  # Heures par défaut
            self._save_check_hours()
        except Exception as e:
            self.logger.error(f"Erreur lors du chargement des heures: {str(e)}")
            self.check_hours = [9, 12, 15, 18, 21]

    def _should_run_task(self, task_id: str) -> bool:
        """Vérifie si une tâche doit être exécutée."""
        current_hour = datetime.now().hour

        # Vérifier si nous sommes dans une heure de vérification
        if current_hour not in self.check_hours:
            return False

        # Vérifier si la tâche a déjà été exécutée récemment
        last_run = self.last_run_times.get(task_id)
        if last_run:
            # Si la tâche a été exécutée il y a moins de 45 minutes
            if datetime.now() - last_run < timedelta(minutes=45):
                return False

        return True

    def _run_scheduler(self):
        """Fonction principale du planificateur."""
        self.logger.info("Démarrage du planificateur")

        while self.running:
            try:
                with self._lock:
                    current_time = datetime.now()

                    for task_id, task in self.tasks.items():
                        if self._should_run_task(task_id):
                            try:
                                task["function"]()
                                self.last_run_times[task_id] = current_time
                                task["last_run"] = current_time
                                self.logger.info(
                                    f"Tâche exécutée avec succès: {task_id}"
                                )
                            except Exception as e:
                                self.logger.error(
                                    f"Erreur lors de l'exécution de la tâche {task_id}: {str(e)}"
                                )

                # Attendre 5 minutes avant la prochaine vérification
                time.sleep(300)

            except Exception as e:
                self.logger.error(f"Erreur dans le planificateur: {str(e)}")
                time.sleep(60)

    def start(self):
        """Démarre le planificateur."""
        if self.running:
            return False

        self.running = True
        self._load_check_hours()
        self.thread = threading.Thread(target=self._run_scheduler)
        self.thread.daemon = True
        self.thread.start()
        self.logger.info("Planificateur démarré")
        return True

    def stop(self):
        """Arrête le planificateur."""
        self.running = False
        if self.thread:
            self.thread.join(timeout=1)
        self.logger.info("Planificateur arrêté")

    def get_status(self) -> Dict:
        """Récupère le statut du planificateur."""
        return {
            "running": self.running,
            "check_hours": self.check_hours,
            "tasks": {
                task_id: {
                    "description": task["description"],
                    "last_run": (
                        task["last_run"].isoformat() if task["last_run"] else None
                    ),
                }
                for task_id, task in self.tasks.items()
            },
        }

    def __del__(self):
        """Destructeur pour s'assurer que le thread est arrêté."""
        self.stop()
