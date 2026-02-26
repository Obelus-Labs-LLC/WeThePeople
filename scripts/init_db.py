"""
Initialize the database schema.
Run this script to create all tables.
"""
from models.database import Base, engine
# Import models so SQLAlchemy registers them
from models.database import Person, Action, SourceDocument

def init():
    Base.metadata.create_all(bind=engine)
    print("✅ DB tables created.")
    print(f"   Tables: {list(Base.metadata.tables.keys())}")

if __name__ == "__main__":
    init()
