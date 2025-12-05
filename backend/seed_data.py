from . import models, database

def seed_default_data():
    db = database.SessionLocal()
    try:
        # Check if products exist
        if db.query(database.Product).count() == 0:
            print("Seeding default data...")
            default_products = [
                {"name": "Sona Masoori Rice", "category": "Grains", "price": 55.0, "stock": 100, "max_stock": 200, "shelf_position": "A1", "icon_name": "wheat"},
                {"name": "Toor Dal", "category": "Pulses", "price": 120.0, "stock": 50, "max_stock": 100, "shelf_position": "B2", "icon_name": "wheat"},
                {"name": "Sunflower Oil (1L)", "category": "Oil", "price": 145.0, "stock": 30, "max_stock": 50, "shelf_position": "C1", "icon_name": "droplet"},
                {"name": "Atta (5kg)", "category": "Flour", "price": 210.0, "stock": 20, "max_stock": 40, "shelf_position": "A2", "icon_name": "wheat"},
                {"name": "Sugar", "category": "Essentials", "price": 42.0, "stock": 80, "max_stock": 150, "shelf_position": "B1", "icon_name": "package"},
                {"name": "Tata Salt", "category": "Essentials", "price": 25.0, "stock": 100, "max_stock": 100, "shelf_position": "B3", "icon_name": "package"},
                {"name": "Red Chilli Powder", "category": "Spices", "price": 60.0, "stock": 40, "max_stock": 80, "shelf_position": "D1", "icon_name": "package"},
                {"name": "Turmeric Powder", "category": "Spices", "price": 35.0, "stock": 45, "max_stock": 90, "shelf_position": "D2", "icon_name": "package"},
                {"name": "Milk (500ml)", "category": "Dairy", "price": 27.0, "stock": 20, "max_stock": 50, "shelf_position": "Fridge", "icon_name": "milk"},
                {"name": "Curd", "category": "Dairy", "price": 35.0, "stock": 15, "max_stock": 30, "shelf_position": "Fridge", "icon_name": "milk"},
                {"name": "Maggi Noodles", "category": "Snacks", "price": 14.0, "stock": 100, "max_stock": 200, "shelf_position": "E1", "icon_name": "utensils"},
                {"name": "Good Day Biscuits", "category": "Snacks", "price": 20.0, "stock": 60, "max_stock": 120, "shelf_position": "E2", "icon_name": "utensils"},
                {"name": "Apple (1kg)", "category": "Fruit", "price": 180.0, "stock": 15, "max_stock": 30, "shelf_position": "F1", "icon_name": "apple"},
                {"name": "Banana (Dozen)", "category": "Fruit", "price": 60.0, "stock": 20, "max_stock": 40, "shelf_position": "F2", "icon_name": "apple"},
                {"name": "Potato (1kg)", "category": "Veg", "price": 30.0, "stock": 50, "max_stock": 100, "shelf_position": "G1", "icon_name": "carrot"},
                {"name": "Onion (1kg)", "category": "Veg", "price": 40.0, "stock": 45, "max_stock": 90, "shelf_position": "G2", "icon_name": "carrot"},
                {"name": "Coke (750ml)", "category": "Beverage", "price": 40.0, "stock": 24, "max_stock": 48, "shelf_position": "Fridge", "icon_name": "coffee"},
                {"name": "Tea Powder (250g)", "category": "Beverage", "price": 120.0, "stock": 30, "max_stock": 60, "shelf_position": "H1", "icon_name": "coffee"}
            ]
            
            for p in default_products:
                db_product = database.Product(**p)
                db.add(db_product)
            
            db.commit()
            print("Default data seeded successfully.")
        else:
            print("Database already has data. Skipping seed.")
            
    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        db.close()
