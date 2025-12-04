import sqlite3

conn = sqlite3.connect('kirana.db')
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE products ADD COLUMN max_stock INTEGER DEFAULT 50")
    conn.commit()
    print("Column added successfully")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
