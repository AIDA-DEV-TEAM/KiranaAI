from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ProductBase(BaseModel):
    name: str
    category: str
    price: float
    stock: int
    max_stock: int = 50 # Default max stock
    shelf_position: Optional[str] = None
    image_url: Optional[str] = None
    icon_name: Optional[str] = None

class ProductCreate(ProductBase):
    pass

# Removed SQLAlchemy Models (Product, Sale) as we are using Local Storage only.


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    language: Optional[str] = "en"
    inventory: Optional[List[dict]] = [] # list of { name: ..., stock: ... }

class ChatResponse(BaseModel):
    response: str
    speech: Optional[str] = None
    sql_query: Optional[str] = None # Keeping for legacy/debug if needed
    action_performed: bool = False
    action: Optional[str] = None
    params: Optional[dict] = None
