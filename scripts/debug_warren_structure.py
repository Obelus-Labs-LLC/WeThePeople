import requests
from bs4 import BeautifulSoup

url = 'https://www.warren.senate.gov/newsroom/press-releases/warren-calls-for-trump-administration-to-act-as-new-start-expires-warns-of-nuclear-arms-race'
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

print("=== Page Structure ===")
main = soup.find('main')
article = soup.find('article')
content_div = soup.find('div', class_='content')

print(f"main tag: {main is not None}")
print(f"article tag: {article is not None}")
print(f"content div: {content_div is not None}")

print("\nAll divs with class containing 'content':")
divs = soup.find_all('div', class_=lambda x: x and 'content' in str(x).lower())
for d in divs[:10]:
    print(f"  {d.get('class')}")

print("\nLooking for press-release specific containers:")
for tag in ['div', 'section', 'article']:
    for cls in ['press-release', 'release', 'body', 'article-content', 'post-content']:
        elem = soup.find(tag, class_=lambda x: x and cls in str(x).lower())
        if elem:
            print(f"  Found: <{tag} class='{elem.get('class')}'>")
            text = elem.get_text(strip=True)[:200]
            print(f"    Text preview: {text}...")

print("\nChecking for paragraphs with actual content:")
paragraphs = soup.find_all('p')
good_paragraphs = [p for p in paragraphs if len(p.get_text(strip=True)) > 100]
print(f"Total <p> tags: {len(paragraphs)}")
print(f"Paragraphs with >100 chars: {len(good_paragraphs)}")
if good_paragraphs:
    print(f"\nFirst substantial paragraph:")
    print(good_paragraphs[0].get_text(strip=True)[:300])
