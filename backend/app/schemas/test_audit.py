import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class TestAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    test_id: uuid.UUID
    user_id: uuid.UUID
    admin_name: str
    action: str
    details: str
    created_at: datetime
