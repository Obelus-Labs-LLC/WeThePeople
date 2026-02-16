import sqlite3

conn = sqlite3.connect('wethepeople.db')
cursor = conn.cursor()

print("=" * 80)
print("MIGRATION VALIDATION")
print("=" * 80)

print("\nActions by migrated person_ids (canonical):")
canonical = ['bernie_sanders', 'chuck_schumer', 'john_thune', 'kathy_castor', 'richard_hudson', 'walkinshaw']
for pid in canonical:
    cursor.execute("SELECT COUNT(*) FROM actions WHERE person_id = ?", (pid,))
    count = cursor.fetchone()[0]
    print(f"  {pid}: {count} actions")

print("\nOld person_ids (should all be 0):")
old_ids = ['sanders', 'schumer', 'thune']
all_zero = True
for pid in old_ids:
    cursor.execute("SELECT COUNT(*) FROM actions WHERE person_id = ?", (pid,))
    count = cursor.fetchone()[0]
    status = "✅" if count == 0 else "❌"
    print(f"  {status} {pid}: {count}")
    if count > 0:
        all_zero = False

print("\nTotal actions count:")
cursor.execute("SELECT COUNT(*) FROM actions")
total = cursor.fetchone()[0]
print(f"  Total: {total}")

print("\n" + "=" * 80)
if all_zero:
    print("✅ MIGRATION SUCCESSFUL - All old person_ids removed")
else:
    print("❌ MIGRATION INCOMPLETE - Some old person_ids remain")

conn.close()
