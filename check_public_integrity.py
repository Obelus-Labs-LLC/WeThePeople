import sqlite3

c = sqlite3.connect('wethepeople.db')
rows = c.execute("SELECT bill_id, title FROM bills WHERE lower(title) LIKE '%public integrity%'").fetchall()
print(rows if rows else 'NO BILL TITLE MATCH')
c.close()
