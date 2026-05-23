"""
ConversationFlowService - Máquina de estados para captura progresiva de datos (Fase 2)

Guía al visitante anónimo a través de una secuencia de preguntas para capturar:
  nombre → email → teléfono → tipo de caso → descripción

Una vez completado el flujo, actualiza el cliente en MongoDB y continúa con RAG normal.

Estado del flujo se mantiene en memoria por sesión WebSocket (no persiste entre conexiones).
"""

import re
from typing import Dict, List, Optional, Any

from app.models.bot import FlowConfig, FlowStep


class FlowState:
    """Estado de un flujo conversacional para una sesión WebSocket"""

    def __init__(self, config: FlowConfig, client_id: Optional[str] = None, existing_data: Optional[Dict] = None):
        self.config = config
        self.client_id = client_id
        self.captured: Dict[str, Any] = {}  # Datos capturados en esta sesión
        self.current_step_index = 0
        self.is_complete = False

        # Determinar qué pasos saltamos si el cliente ya tiene el dato
        self._pending_steps: List[FlowStep] = []
        for step in config.steps:
            if config.skip_if_known and existing_data and existing_data.get(step.field):
                continue  # Ya tenemos este dato
            self._pending_steps.append(step)

        if not self._pending_steps:
            self.is_complete = True

    @property
    def current_step(self) -> Optional[FlowStep]:
        if self.current_step_index >= len(self._pending_steps):
            return None
        return self._pending_steps[self.current_step_index]

    def get_current_question(self) -> Optional[str]:
        """Retorna la pregunta del paso actual, con las opciones si las hay"""
        step = self.current_step
        if not step:
            return None

        question = step.question
        if step.choices:
            options = "\n".join(f"  {i+1}. {opt}" for i, opt in enumerate(step.choices))
            question = f"{question}\n{options}"
        return question

    def process_answer(self, answer: str) -> Dict[str, Any]:
        """
        Procesa la respuesta del usuario al paso actual.

        Returns:
            {
                "valid": bool,
                "error": str | None,
                "next_question": str | None,
                "is_complete": bool,
                "captured_field": str | None,
                "captured_value": Any
            }
        """
        step = self.current_step
        if not step or self.is_complete:
            return {"valid": True, "is_complete": True}

        answer = answer.strip()

        # Validar respuesta según el tipo
        valid, value, error = self._validate_answer(step, answer)

        if not valid:
            return {
                "valid": False,
                "error": error or step.validation_hint or f"Por favor, proporciona un {step.field} válido.",
                "next_question": self.get_current_question(),
                "is_complete": False,
                "captured_field": None,
                "captured_value": None,
            }

        # Guardar respuesta
        self.captured[step.field] = value
        self.current_step_index += 1

        # ¿Completamos el flujo?
        if self.current_step_index >= len(self._pending_steps):
            self.is_complete = True
            return {
                "valid": True,
                "error": None,
                "next_question": None,
                "is_complete": True,
                "captured_field": step.field,
                "captured_value": value,
            }

        # Siguiente pregunta
        return {
            "valid": True,
            "error": None,
            "next_question": self.get_current_question(),
            "is_complete": False,
            "captured_field": step.field,
            "captured_value": value,
        }

    def _validate_answer(self, step: FlowStep, answer: str):
        """Valida la respuesta según el tipo del campo. Retorna (valid, value, error)."""
        if step.required and not answer:
            return False, None, "Este campo es requerido. Por favor, responde la pregunta."

        if not answer and not step.required:
            return True, None, None

        if step.field_type == "email":
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, answer):
                return False, None, "Por favor, ingresa un correo electrónico válido (ej: nombre@dominio.com)"
            return True, answer.lower(), None

        if step.field_type == "phone":
            # Aceptar varios formatos: +54 11 1234-5678, 11 1234 5678, etc.
            cleaned = re.sub(r'[\s\-\(\)\+]', '', answer)
            if not cleaned.isdigit() or len(cleaned) < 7:
                return False, None, "Por favor, ingresa un número de teléfono válido (ej: +54 9 11 1234-5678)"
            return True, answer, None

        if step.field_type == "choice" and step.choices:
            # Aceptar el número o el texto de la opción
            try:
                idx = int(answer) - 1
                if 0 <= idx < len(step.choices):
                    return True, step.choices[idx], None
            except ValueError:
                pass
            # Buscar coincidencia por texto
            answer_lower = answer.lower()
            for choice in step.choices:
                if answer_lower in choice.lower() or choice.lower() in answer_lower:
                    return True, choice, None
            choices_list = ", ".join(step.choices)
            return False, None, f"Por favor, elige una opción válida: {choices_list}"

        # text: cualquier respuesta no vacía
        if len(answer) < 2:
            return False, None, "La respuesta es muy corta. Por favor, escribe más."

        return True, answer, None

    def get_client_update_data(self) -> Dict[str, Any]:
        """Retorna los datos capturados para actualizar el cliente en MongoDB"""
        update: Dict[str, Any] = {}
        field_mapping = {
            "name": "name",
            "email": "email",
            "phone": "phone",
            "case_type": None,  # Va a metadata
            "description": None,  # Va a metadata
        }
        metadata: Dict[str, Any] = {}

        for field, value in self.captured.items():
            mapped = field_mapping.get(field)
            if mapped:
                update[mapped] = value
            else:
                metadata[field] = value

        if metadata:
            update["metadata"] = metadata

        return update

    def get_lead_score_bonus(self) -> float:
        """Calcula bonificación de score basada en el tipo de caso capturado"""
        case_type = self.captured.get("case_type", "")
        if not case_type:
            return 0.0

        # Pesos por tipo de caso legal (ajustables)
        score_weights = {
            "divorcio": 15.0,
            "custodia": 12.0,
            "herencia": 10.0,
            "laboral": 8.0,
            "penal": 12.0,
            "civil": 6.0,
            "contrato": 5.0,
            "consulta": 3.0,
        }

        case_lower = case_type.lower()
        for key, weight in score_weights.items():
            if key in case_lower:
                return weight

        return 3.0  # Tipo de caso desconocido pero completo


def create_flow_state(
    config: FlowConfig,
    client_id: Optional[str] = None,
    existing_client_data: Optional[Dict] = None,
) -> FlowState:
    """Factory para crear un estado de flujo inicial"""
    return FlowState(config, client_id=client_id, existing_data=existing_client_data)
