import sys
print("WARNING: This is a V1-era script. Use jobs/seed_tracked_companies.py instead.")
sys.exit(1)

import json
from models import database
from models.database import SessionLocal, Person

db = SessionLocal()

with open("data/people_seed.json") as f:
    people = json.load(f)
    for p in people:
        person = Person(**p)
        db.merge(person)
    db.commit()

db.close()
