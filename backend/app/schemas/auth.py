import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    display_name: str
    role: str
    status: str
    last_login_at: Optional[datetime] = None
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: str = Field(..., min_length=5, max_length=255)
    display_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(default="PROFESSOR", pattern=r"^(ADMIN|PROFESSOR|TEACHER)$")


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[str] = Field(None, min_length=5, max_length=255)
    role: Optional[str] = Field(None, pattern=r"^(ADMIN|PROFESSOR|TEACHER)$")
    status: Optional[str] = Field(None, pattern=r"^(ACTIVE|INACTIVE|DISABLED)$")
    password: Optional[str] = Field(None, min_length=8, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=6, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class HealthResponse(BaseModel):
    status: str
    database: Optional[str] = "not_checked"
    app_name: str
    environment: str


class MessageResponse(BaseModel):
    message: str
