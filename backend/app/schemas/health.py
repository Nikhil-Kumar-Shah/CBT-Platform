from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class SubsystemStatus(BaseModel):
    status: str = Field(..., description="'operational', 'degraded', 'offline', or 'unknown'")
    latency_ms: Optional[float] = None
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class DatabaseHealthResponse(BaseModel):
    status: str = Field(..., description="'connected' or 'disconnected'")
    latency_ms: float
    database_type: str = "PostgreSQL"
    is_writable: bool = True
    timestamp: datetime
    message: str


class SystemHealthResponse(BaseModel):
    status: str = Field(..., description="'operational', 'degraded', or 'offline'")
    app_name: str
    environment: str
    server_time: datetime
    uptime_seconds: float
    started_at: datetime
    database: DatabaseHealthResponse
    services: Dict[str, SubsystemStatus]
    last_successful_check: datetime
    last_failed_check: Optional[datetime] = None
