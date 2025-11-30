from .database import init_db, SessionLocal, Product, Sale
from datetime import datetime, timedelta
import random

def seed_data():
    init_db()
    db = SessionLocal()

    # Check if data exists
    if db.query(Product).count() > 0:
        print("Data already exists.")
        db.close()
        return

    print("Seeding data...")

    # Products
    products = [
        Product(name="Basmati Rice", category="Grains", price=120.0, stock=50),
        Product(name="Toor Dal", category="Pulses", price=150.0, stock=30),
        Product(name="Sunflower Oil", category="Oil", price=180.0, stock=20),
        Product(name="Sugar", category="Sweeteners", price=45.0, stock=100),
        Product(name="Tata Salt", category="Spices", price=25.0, stock=200),
        Product(name="Red Chilli Powder", category="Spices", price=300.0, stock=15),
        Product(name="Turmeric Powder", category="Spices", price=250.0, stock=18),
        Product(name="Wheat Flour", category="Grains", price=40.0, stock=60),
        Product(name="Milk", category="Dairy", price=30.0, stock=10),
        Product(name="Curd", category="Dairy", price=35.0, stock=12),
    ]
    
    db.add_all(products)
    db.commit()

    # Refresh to get IDs
    for p in products:
        db.refresh(p)

    # Sales (Last 7 days)
    sales = []
    for _ in range(20):
        product = random.choice(products)
        qty = random.randint(1, 5)
        sale = Sale(
            product_id=product.id,
            quantity=qty,
            total_amount=product.price * qty,
            timestamp=datetime.utcnow() - timedelta(days=random.randint(0, 6))
        )
        sales.append(sale)
    
    db.add_all(sales)
    db.commit()
    
    print("Seeding complete!")
    db.close()

if __name__ == "__main__":
    seed_data()
