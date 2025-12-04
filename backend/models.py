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

class Product(ProductBase):
    id: int

    class Config:
        from_attributes = True

class SaleCreate(BaseModel):
    product_id: int
    quantity: int

class Sale(BaseModel):
    id: int
    product_id: int
    quantity: int
    total_amount: float
    timestamp: datetime

    class Config:
        from_attributes = True

class SaleResponse(Sale):
    product_name: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    language: Optional[str] = "en"

class ChatResponse(BaseModel):
    response: str
    sql_query: Optional[str] = None
