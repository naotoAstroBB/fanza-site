#!/usr/bin/env python3
"""Static contract checks for client-only discovery and comparison UI."""
from html.parser import HTMLParser
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
class Inspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=Counter()
        self.scripts=[]
        self.styles=[]
        self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):self.ids[a['id']]+=1
        if tag=='script' and a.get('src'):self.scripts.append(a['src'].split('?')[0])
        if tag=='link' and a.get('rel')=='stylesheet':self.styles.append(a.get('href'))
        if tag=='a' and a.get('href'):self.links.append(a.get('href'))

def inspect(path):
    html=(ROOT/path).read_text(encoding='utf-8-sig')
    p=Inspector()
    p.feed(html)
    assert all(n==1 for n in p.ids.values()),f'duplicate IDs: {path}'
    return p,html
home,home_source=inspect('home.html')
detail,detail_source=inspect('product.html')
compare,compare_source=inspect('compare.html')
for identifier in ['compareTray','compareTrayCount','filterPreviewOnly','savedSearchList',
                   'savedSearchSection','productGrid','advancedFilterForm']:
    assert home.ids[identifier]==1,identifier
for script in ['js/catalogue-filters.js','js/product-discovery.js','js/app.js']:
    assert script in home.scripts,script
assert home.scripts.index('js/product-discovery.js')<home.scripts.index('js/app.js')
assert 'css/home-redesign.css' in home.styles
assert 'compare.html' in home.links
for identifier in ['compareBtnDetail','detailCompareLink']:
    # These IDs are in client-side rendered template strings, not static HTML.
    assert identifier in detail_source
assert 'js/product-discovery.js' in detail.scripts
assert 'toggleCompareDetail' in detail_source
for identifier in ['comparePageCount','comparePageContent','compareClear']:
    assert compare.ids[identifier]==1,identifier
assert 'js/compare-page.js' in compare.scripts
assert 'js/product-discovery.js' in compare.scripts
assert compare.scripts.index('js/product-discovery.js')<compare.scripts.index('js/compare-page.js')
assert 'css/compare.css' in compare.styles
assert 'name="robots" content="noindex,follow"' in compare_source
assert 'js/age-gate.js' in compare.scripts
assert 'FANZA' in compare_source
print('Discovery HTML contracts: all elements, imports, SEO and age gate checks passed')
