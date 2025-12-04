from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import database, models

router = APIRouter(prefix="/inventory", tags=["inventory"])

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=List[models.Product])
def read_products(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    products = db.query(database.Product).offset(skip).limit(limit).all()
    return products

@router.post("/", response_model=models.Product)
def create_product(product: models.ProductCreate, db: Session = Depends(get_db)):
    db_product = database.Product(**product.dict())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.post("/bulk", response_model=List[models.Product])
def create_products_bulk(products: List[models.ProductCreate], db: Session = Depends(get_db)):
    processed_products = []
    for product in products:
        # Check if product exists by name (case-insensitive)
        existing_product = db.query(database.Product).filter(
            database.Product.name.ilike(product.name)
        ).first()

        if existing_product:
            # Update stock
            existing_product.stock += product.stock
            # Update price if provided and non-zero (assuming bill might have updated prices)
            if product.price > 0:
                existing_product.price = product.price
            processed_products.append(existing_product)
        else:
            # Create new product
            db_product = database.Product(**product.dict())
            db.add(db_product)
            processed_products.append(db_product)
    
    db.commit()
    for p in processed_products:
        db.refresh(p)
    return processed_products

@router.put("/{product_id}", response_model=models.Product)
def update_product(product_id: int, product: models.ProductCreate, db: Session = Depends(get_db)):
    db_product = db.query(database.Product).filter(database.Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    for key, value in product.dict().items():
        setattr(db_product, key, value)
    
    db.commit()
    db.refresh(db_product)
    return db_product

    db.delete(db_product)
    db.commit()
    return {"message": "Product deleted"}

@router.post("/shelf/bulk")
def update_shelf_locations_bulk(items: List[dict], db: Session = Depends(get_db)):
    updated_count = 0
    for item in items:
        name = item.get("name")
        shelf = item.get("shelf")
        if name and shelf:
            # Find product by name (case-insensitive)
            db_product = db.query(database.Product).filter(
                database.Product.name.ilike(f"%{name}%") # Fuzzy match might be better, but simple contains for now
            ).first()
            
            if db_product:
                db_product.shelf_position = shelf
                updated_count += 1
    
    db.commit()
    return {"message": f"Updated shelf locations for {updated_count} products"}
