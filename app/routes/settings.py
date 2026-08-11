import logging

from fastapi import APIRouter, Request

from app.models.schemas import ApiResponse, ErrorDetail, PersonaSettingsRequest, PersonaSettingsData
from app.services.conversation_manager import ConversationManager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.post("/persona", response_model=ApiResponse[PersonaSettingsData])
async def set_persona(request: Request, payload: PersonaSettingsRequest) -> ApiResponse[PersonaSettingsData]:
    conversation_manager: ConversationManager = request.app.state.conversation_manager

    # Empty string is valid — it means "no custom persona / default assistant".
    conversation_manager.set_persona(payload.persona_prompt or "")
    return ApiResponse(success=True, data=PersonaSettingsData(saved=True, persona_prompt=payload.persona_prompt))


@router.get("/persona", response_model=ApiResponse[PersonaSettingsData])
async def get_persona(request: Request) -> ApiResponse[PersonaSettingsData]:
    conversation_manager: ConversationManager = request.app.state.conversation_manager
    persona = conversation_manager.get_persona()
    return ApiResponse(success=True, data=PersonaSettingsData(saved=True, persona_prompt=persona))