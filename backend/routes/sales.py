from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import database, models

router = APIRouter(prefix="/sales", tags=["sales"])

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=models.SaleResponse)
def create_sale(sale: models.SaleCreate, db: Session = Depends(get_db)):
    # Check stock
    product = db.query(database.Product).filter(database.Product.id == sale.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.stock < sale.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    
    # Calculate total
    total_amount = product.price * sale.quantity
    
    # Create sale
    db_sale = database.Sale(
        product_id=sale.product_id,
        quantity=sale.quantity,
        total_amount=total_amount
    )
    
    # Update stock
    product.stock -= sale.quantity
    
    db.add(db_sale)
    db.commit()
    db.refresh(db_sale)
    
    # Add product name for response
    response = models.SaleResponse.model_validate(db_sale)
    response.product_name = product.name
    return response

@router.get("/", response_model=List[models.SaleResponse])
def read_sales(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    sales = db.query(database.Sale).order_by(database.Sale.id.desc()).offset(skip).limit(limit).all()
    # Enrich with product names
    results = []
    for sale in sales:
        # Manually construct to avoid validation issues with SQLAlchemy objects
        s = models.SaleResponse(
            id=sale.id,
            product_id=sale.product_id,
            quantity=sale.quantity,
            total_amount=sale.total_amount,
            timestamp=sale.timestamp,
            product_name=sale.product.name if sale.product else "Unknown"
        )
        results.append(s)
    return results
