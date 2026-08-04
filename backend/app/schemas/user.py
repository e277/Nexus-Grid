from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Role(str, Enum):
    admin = "admin"
    farmer = "farmer"
    buyer = "buyer"
    logistics = "logistics"
    government = "government"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: Role = Role.farmer


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: Role
    active: bool
    created_at: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
