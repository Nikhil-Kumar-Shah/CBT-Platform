import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict, Field


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    timestamp: datetime
    event_type: str
    category: str
    severity: str
    actor: str
    actor_type: str
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    description: str
    ip_address: Optional[str] = None
    session_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class AuditEventListResponse(BaseModel):
    items: List[AuditEventResponse]
    total: int = Field(..., alias="total")
    page: int
    page_size: int
    total_pages: int
