base = 'https://www.warren.senate.gov/newsroom/press-releases'
base_norm = base.rstrip('/').split('?')[0]

test_urls = [
    'https://www.warren.senate.gov/newsroom/press-releases',
    'https://www.warren.senate.gov/newsroom/press-releases/',
    'https://www.warren.senate.gov/newsroom/press-releases/table/',
    'https://www.warren.senate.gov/newsroom/press-releases/warren-calls-something'
]

print(f'Base normalized: {base_norm}')
print()
for url in test_urls:
    url_norm = url.rstrip('/').split('?')[0]
    match = url_norm == base_norm
    print(f'{url}')
    print(f'  -> {url_norm}')
    print(f'  -> Filtered out: {match}')
    print()
