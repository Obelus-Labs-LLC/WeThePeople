import requests
from bs4 import BeautifulSoup

url = 'https://www.warren.senate.gov/newsroom/press-releases/warren-calls-for-trump-administration-to-act-as-new-start-expires-warns-of-nuclear-arms-race'
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

print("=== Before cleanup ===")
print(f"Total text length: {len(soup.get_text())}")

print("\n=== Removing unwanted elements ===")
removed = 0
for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button']):
    removed += 1
    tag.decompose()
print(f"Removed {removed} elements")

print("\n=== After cleanup ===")
print(f"Total text length: {len(soup.get_text())}")

print("\n=== Collecting paragraphs ===")
paragraphs = soup.find_all('p')
substantial = [p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 50]
print(f"Total paragraphs: {len(paragraphs)}")
print(f"Substantial paragraphs: {len(substantial)}")

if substantial:
    combined = ' '.join(substantial)
    print(f"\nCombined text length: {len(combined)}")
    print(f"\nFirst 500 characters:")
    print(combined[:500])
