"""Render one accessible site menu into every public page at build time."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
VERSION = '20260916-3'
PAGES = {
    'index.html': 'home', 'arcade.html': 'arcade',
    'murmuration.html': 'murmuration', 'cheeky-phone.html': 'cheeky',
    'agent-control.html': 'agent', 'cv.html': 'profile',
    'references.html': 'references', '404.html': 'missing',
    'crossword/index.html': 'crossword',
    'cartoon-collingham.html': 'village',
}
CURRENT = {'arcade': '/arcade.html', 'murmuration': '/murmuration.html',
           'cheeky': '/cheeky-phone.html', 'crossword': '/crossword/',
           'profile': '/cv.html', 'references': '/cv.html', 'agent': '/#work', 'village': '/#place',
           'monocular': '/#work'}


def render_page(text: str, page: str) -> str:
    header = (ROOT / 'templates/site-header.html').read_text(encoding='utf-8').strip()
    if page in CURRENT:
        header = header.replace(f'href="{CURRENT[page]}"', f'href="{CURRENT[page]}" aria-current="page"')
    header = '<!-- site-header:start -->\n' + header + '\n<!-- site-header:end -->'
    if '<!-- site-header:start -->' in text:
        text = re.sub(r'<!-- site-header:start -->.*?<!-- site-header:end -->', lambda _: header, text, flags=re.S)
    else:
        # Migrate the old navigation only; retain document and simulation toolbars.
        old = {'home': 'nav-shell', 'arcade': 'arcade-nav', 'agent': 'overview-header'}
        if page in old:
            text, count = re.subn(r'<header class="' + old[page] + r'">.*?</header>', lambda _: header, text, count=1, flags=re.S)
            if count != 1:
                raise ValueError(f'Missing original header on {page}')
        elif page == 'cheeky':
            text, count = re.subn(r'<header>.*?</header>', lambda _: header, text, count=1, flags=re.S)
            if count != 1:
                raise ValueError('Missing original Cheeky Phone header')
        else:
            text = re.sub(r'(<body\b[^>]*>)', lambda match: match[0] + '\n' + header, text, count=1)
    text = re.sub(r'\s*<!-- site-assets:start -->.*?<!-- site-assets:end -->', '', text, flags=re.S)
    text = re.sub(r'\s*<link[^>]+href="/assets/(?:crossword-nav|cheeky-nav|arcade-nav)\.css[^>]*>', '', text)
    assets = f'\n    <!-- site-assets:start -->\n    <link rel="stylesheet" href="/assets/site-shell.css?v={VERSION}">\n    <script defer src="/assets/site-shell.js?v={VERSION}"></script>\n    <!-- site-assets:end -->\n'
    text = text.replace('</head>', assets + '</head>', 1)
    text = re.sub(r'<body([^>]*)>', lambda m: '<body' + re.sub(r'\sdata-site-page="[^"]*"', '', m[1]) + f' data-site-page="{page}">', text, count=1)
    text = re.sub(r'(<meta name="theme-color" content=")[^"]+', r'\g<1>#06100f', text)
    return '\n'.join(line.rstrip() for line in text.splitlines()) + '\n'


def apply_site_shell(directory: Path) -> None:
    for relative, page in PAGES.items():
        path = directory / relative
        if path.is_file():
            path.write_text(render_page(path.read_text(encoding='utf-8'), page), encoding='utf-8', newline='\n')


if __name__ == '__main__':
    apply_site_shell(ROOT)
