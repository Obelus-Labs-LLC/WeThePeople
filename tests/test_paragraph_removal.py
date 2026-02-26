import requests
from bs4 import BeautifulSoup

url = 'https://www.warren.senate.gov/newsroom/press-releases/warren-blumenthal-goldman-and-27-members-of-congress-urge-agency-watchdogs-to-investigate-trump-administrations-retreat-from-white-collar-crime-enforcement'
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

print("=== BEFORE removing unwanted tags ===")
paragraphs_before = soup.find_all('p')
print(f"Total <p> tags: {len(paragraphs_before)}")
substantial_before = [p for p in paragraphs_before if len(p.get_text(strip=True)) > 50]
print(f"Substantial paragraphs: {len(substantial_before)}")

print("\n=== Removing unwanted tags ===")
for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button']):
    tag.decompose()

print("\n=== AFTER removing unwanted tags ===")
paragraphs_after = soup.find_all('p')
print(f"Total <p> tags: {len(paragraphs_after)}")
substantial_after = [p for p in paragraphs_after if len(p.get_text(strip=True)) > 50]
print(f"Substantial paragraphs: {len(substantial_after)}")

if substantial_after:
    combined = ' '.join([p.get_text(strip=True) for p in substantial_after])
    print(f"\nCombined text length: {len(combined)}")
    print(f"First 300 chars: {combined[:300]}")
