import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict
import json
from pydantic import BaseModel, ConfigDict, field_validator


class IntegrityEventCreate(BaseModel):
    event_type: str
    client_timestamp: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    metadata_json: Optional[str] = None
    session_id: Optional[str] = None

    @field_validator("metadata_json", mode="before")
    @classmethod
    def serialize_metadata(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, (dict, list)):
            return json.dumps(v)
        return str(v)


class IntegrityEventBatchRequest(BaseModel):
    events: List[IntegrityEventCreate]


class IntegrityEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    attempt_id: uuid.UUID
    event_type: str
    timestamp: datetime
    client_timestamp: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    metadata_json: Optional[str] = None
    session_id: Optional[str] = None


class IntegritySummaryResponse(BaseModel):
    attempt_id: uuid.UUID
    total_events: int = 0
    tab_switches: int = 0
    fullscreen_exits: int = 0
    multiple_tab_detections: int = 0
    inactivity_warnings: int = 0
    network_interruptions: int = 0
    total_inactive_seconds: float = 0.0
    refresh_count: int = 0
    review_recommended: bool = False
    review_reasons: List[str] = []
    events: List[IntegrityEventResponse] = []
