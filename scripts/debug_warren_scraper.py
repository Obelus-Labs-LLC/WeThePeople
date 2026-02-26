import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

url = 'https://www.warren.senate.gov/newsroom/press-releases'
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

print("=== Strategy 1: Links in <article> tags ===")
articles = soup.find_all('article')
print(f"Found {len(articles)} <article> tags")

print("\n=== Strategy 2: Links with /press/ pattern ===")
patterns = ['/press/', '/news/', '/statement', '/remark', '/media/']
links_found = []
for a in soup.find_all('a', href=True):
    href = a['href']
    if any(pattern in href.lower() for pattern in patterns):
        full_url = urljoin(url, href)
        links_found.append((href, full_url))

print(f"Found {len(links_found)} links matching patterns")
print("\nFirst 10 links (raw href | full URL):")
for href, full in links_found[:10]:
    print(f"  {href} -> {full}")

# Now apply filtering
base_url_normalized = url.rstrip('/').split('?')[0]
filtered = []
for href, full in links_found:
    full_norm = full.rstrip('/').split('?')[0]
    if full_norm != base_url_normalized and '/table/' not in full:
        filtered.append(full)

print(f"\n=== After filtering ===")
print(f"Remaining links: {len(filtered)}")
print("\nFirst 10 after filtering:")
for link in filtered[:10]:
    print(f"  {link}")
