"""Build the public article archive from reviewed, local content."""
from pathlib import Path
from html import escape as e
import json, re, math
from datetime import date
from email.utils import format_datetime
from datetime import datetime, timezone
from xml.etree import ElementTree as ET
try:
    from .site_shell import render_page
except ImportError:
    from site_shell import render_page

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://lozknowles.com'

def page(title, description, path, body):
    return render_page(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} | Lawrence Knowles</title><meta name="description" content="{e(description, quote=True)}">
<link rel="canonical" href="{ORIGIN}{path}"><meta property="og:title" content="{e(title, quote=True)}">
<meta property="og:description" content="{e(description, quote=True)}"><meta property="og:url" content="{ORIGIN}{path}">
<meta property="og:type" content="article"><meta name="theme-color" content="#06100f">
<link rel="alternate" type="application/rss+xml" title="Lawrence Knowles — Blog" href="/blog/feed.xml">
<link rel="stylesheet" href="/blog/blog.css"></head><body>
<a class="skip" href="#main">Skip to content</a><main id="main">{body}</main>
<footer class="blog-footer"><a href="/">Lawrence Knowles</a><span>Independent writing on work, AI and responsibility.</span><a href="/blog/feed.xml">RSS feed ↗</a></footer></body></html>''', 'blog')

def build_blog(output):
    target=Path(output)/'blog';target.mkdir(parents=True,exist_ok=True)
    posts=json.loads((ROOT/'content/blog/articles.json').read_text(encoding='utf-8'))
    cards=[]
    rss=ET.Element('rss',version='2.0');channel=ET.SubElement(rss,'channel')
    for tag,value in [('title','Lawrence Knowles — Blog'),('link',ORIGIN+'/blog/'),('description','Work, intelligence and responsibility.')]:ET.SubElement(channel,tag).text=value
    sitemap=ET.Element('urlset',xmlns='http://www.sitemaps.org/schemas/sitemap/0.9')
    ET.SubElement(ET.SubElement(sitemap,'url'),'loc').text=ORIGIN+'/blog/'
    for i,p in enumerate(posts):
        slug=p['slug']
        if not re.fullmatch('[a-z0-9-]+',slug):raise ValueError('Invalid article slug')
        body=(ROOT/'content/blog'/f'{slug}.html').read_text(encoding='utf-8')
        minutes=max(1,math.ceil(len(re.sub('<[^>]+>',' ',body).split())/220))
        path=f'/blog/{slug}/';label=date.fromisoformat(p['date']).strftime('%d %B %Y').lstrip('0')
        meta=f'<span>{e(p["category"])}</span><time datetime="{p["date"]}">{label}</time><span>{minutes} min read</span>'
        source=f'<p class="original">Also published on <a href="{e(p["original"],quote=True)}">{ "Medium" if "medium.com" in p["original"] else "LinkedIn"} ↗</a>.</p>' if p['original'] else ''
        next_post=posts[(i+1)%len(posts)]
        article=f'''<article><header class="article-head"><a class="back" href="/blog/">← All articles</a><div class="meta">{meta}</div><h1>{e(p['title'])}</h1><p class="byline">By Lawrence Knowles</p></header><div class="prose">{body}{source}<p class="date-note">This article reflects the evidence and development status at its original publication date.</p></div></article><aside class="next"><span class="eyebrow">Continue reading</span><a href="/blog/{next_post['slug']}/">{e(next_post['title'])} ↗</a></aside>'''
        folder=target/slug;folder.mkdir(exist_ok=True)
        (folder/'index.html').write_text(page(p['title'],p['summary'],path,article),encoding='utf-8',newline='\n')
        cards.append(f'<article class="card"><div class="meta">{meta}</div><h2><a href="{path}">{e(p["title"])}</a></h2><p>{e(p["summary"])}</p><a class="read" href="{path}">Read article <span aria-hidden="true">↗</span></a></article>')
        item=ET.SubElement(channel,'item')
        for tag,val in [('title',p['title']),('link',ORIGIN+path),('guid',ORIGIN+path),('description',p['summary']),('pubDate',format_datetime(datetime.fromisoformat(p['date']).replace(tzinfo=timezone.utc)))]:ET.SubElement(item,tag).text=val
        url=ET.SubElement(sitemap,'url');ET.SubElement(url,'loc').text=ORIGIN+path
    home=f'<section class="blog-hero"><p class="eyebrow">The blog · Lawrence Knowles</p><h1>Work, intelligence<br>&amp; <em>responsibility.</em></h1><p class="intro">Practical questions about AI, digital labour and the people who live with the consequences. Evidence before enthusiasm. Curiosity before certainty.</p><a class="hero-link" href="#articles">Explore the writing ↓</a></section><section id="articles" class="archive" aria-label="Articles"><div class="archive-title"><h2>Notes from the work</h2><span>{len(posts):02} articles</span></div><div class="cards">'+''.join(cards)+'</div></section>'
    (target/'index.html').write_text(page('Blog','Articles by Lawrence Knowles on agents, digital labour, economics and accountability.','/blog/',home),encoding='utf-8',newline='\n')
    (target/'blog.css').write_bytes((ROOT/'content/blog/blog.css').read_bytes())
    ET.indent(rss);ET.ElementTree(rss).write(target/'feed.xml',encoding='utf-8',xml_declaration=True)
    ET.indent(sitemap);ET.ElementTree(sitemap).write(target/'sitemap.xml',encoding='utf-8',xml_declaration=True)
    print(f'Built {len(posts)} articles in {target}')

if __name__=='__main__':
    import sys
    build_blog(Path(sys.argv[1]) if len(sys.argv)>1 else ROOT)
