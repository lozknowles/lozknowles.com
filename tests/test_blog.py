"""Verify reviewed article sources survive the public blog build."""
import hashlib
import json
import re
import struct
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from scripts.build_blog import ROOT, ORIGIN, build_blog
from scripts.publication_privacy import load_allowlist, split_allowed, scan_binary, scan_text


class BlogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.output = Path(cls.directory.name)
        build_blog(cls.output)
        cls.blog = cls.output / 'blog'
        cls.posts = json.loads((ROOT / 'content/blog/articles.json').read_text(encoding='utf-8'))
        cls.manifest = json.loads((ROOT / 'content/blog/sources-manifest.json').read_text(encoding='utf-8'))

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_unique_articles_and_newest_first(self):
        self.assertEqual(len(self.posts), 11)
        slugs = [p['slug'] for p in self.posts]
        self.assertEqual(len(set(slugs)), 11)
        self.assertTrue(all(re.fullmatch('[a-z0-9-]+', slug) for slug in slugs))
        dates = [p['date'] for p in self.posts]
        self.assertEqual(dates, sorted(dates, reverse=True))
        home = (self.blog / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(home.count('<article class="card">'), 11)
        for post in self.posts:
            page = (self.blog / post['slug'] / 'index.html').read_text(encoding='utf-8')
            self.assertEqual(page.count('<h1>'), 1)
            self.assertIn('<a href="/blog/" aria-current="page">Blog</a>', page)
            self.assertIn(f'content="{ORIGIN}/blog/{post["slug"]}/"', page)

    def test_rss_and_sitemap_cover_each_article_once(self):
        expected = [f'{ORIGIN}/blog/{p["slug"]}/' for p in self.posts]
        rss = ET.parse(self.blog / 'feed.xml')
        links = [i.findtext('link') for i in rss.findall('./channel/item')]
        self.assertEqual(links, expected)
        self.assertEqual([i.findtext('title') for i in rss.findall('./channel/item')], [p['title'] for p in self.posts])
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        locs = [l.text for l in ET.parse(self.blog / 'sitemap.xml').findall('./s:url/s:loc', ns)]
        self.assertEqual(locs, [ORIGIN + '/blog/'] + expected)

    def test_all_reviewed_bodies_are_preserved(self):
        hashes = dict(self.manifest['existing_body_sha256'])
        hashes.update({m['slug']: m['body_sha256'] for m in self.manifest['new_articles']})
        self.assertEqual(len(hashes), 11)
        for post in self.posts:
            slug = post['slug']
            bodyfile = ROOT / 'content/blog' / f'{slug}.html'
            reviewed_body = bodyfile.read_text(encoding='utf-8')
            # Git normalises checkout newlines; preserve the reviewed text on
            # both Windows (CRLF) and Linux (LF), including all markup and links.
            self.assertEqual(hashlib.sha256(reviewed_body.encode('utf-8')).hexdigest(), hashes[slug])
            body = reviewed_body.rstrip()
            page = (self.blog / slug / 'index.html').read_text(encoding='utf-8')
            self.assertIn('<div class="prose">' + body, page)
            blocked, _ = split_allowed(scan_text(f'blog/{slug}/index.html', page), load_allowlist(ROOT / 'config/publication-privacy-allowlist.json'))
            self.assertEqual(blocked, [])

    def test_covers_are_exact_reviewed_bytes_with_alt_and_dimensions(self):
        entries = {m['slug']: m for m in self.manifest['new_articles']}
        home = (self.blog / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(len(entries), 5)
        self.assertEqual(home.count('class="card-cover"'), 5)
        for post in self.posts:
            if 'image' not in post:
                continue
            image = post['image']
            path = self.blog / 'images' / image['file']
            data = path.read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), entries[post['slug']]['image_sha256'])
            self.assertEqual(struct.unpack('>II', data[16:24]), (image['width'], image['height']))
            self.assertEqual(scan_binary('blog/images/' + image['file'], data), [])
            page = (self.blog / post['slug'] / 'index.html').read_text(encoding='utf-8')
            self.assertIn('alt="' + image['alt'] + '"', page)
            self.assertIn('alt="' + image['alt'] + '"', home)
            self.assertIn(f'property="og:image" content="{ORIGIN}/blog/images/{image["file"]}"', page)
            self.assertIn('class="article-cover"', page)


if __name__ == '__main__':
    unittest.main()
