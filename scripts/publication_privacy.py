#!/usr/bin/env python3
"""Fail closed when a publication artefact or live site leaks build details.

The checks deliberately target information that does not need to cross the
publication boundary: source maps, source-only files, local paths and hosts,
model/provider names, secret-shaped values, debug/environment traces, Git
revision labels, revealing document/media metadata, versioned server banners,
and inconsistent error responses.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import ipaddress
import json
import posixpath
import re
import struct
import sys
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


TEXT_SUFFIXES = {
    ".css",
    ".csv",
    ".htaccess",
    ".html",
    ".js",
    ".json",
    ".mjs",
    ".svg",
    ".txt",
    ".webmanifest",
    ".xml",
}
SOURCE_ONLY_NAMES = {
    "architecture.md",
    "changelog",
    "changelog.md",
    "composer.lock",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "readme",
    "readme.md",
    "readme.txt",
    "security.md",
    "tsconfig.json",
    "yarn.lock",
}
SOURCE_ONLY_PARTS = {".git", ".github", "config", "node_modules", "scripts", "src", "tests"}
BACKUP_PART = re.compile(r"(?i)(?:^|[-_.])(?:backup|pre|rollback)(?:[-_.]|$)")
MANIFEST_NAME = re.compile(r"(?i)(?:^|[-_.])(?:asset[-_]?|build[-_]?)?manifest(?:\.|$)")
IPV4 = re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])")


@dataclass(frozen=True, order=True)
class Finding:
    path: str
    code: str
    detail: str


@dataclass(frozen=True)
class AllowEntry:
    code: str
    path: str
    reason: str


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        for key in ("href", "src", "poster"):
            if values.get(key):
                self.links.add(values[key] or "")
        if values.get("srcset"):
            for candidate in (values["srcset"] or "").split(","):
                url = candidate.strip().split(" ", 1)[0]
                if url:
                    self.links.add(url)


TEXT_RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "source-map-reference",
        re.compile(r"(?i)(?:sourceMappingURL|sourceURL)\s*="),
        "source-map or source-URL directive",
    ),
    (
        "generator-meta",
        re.compile(
            r"(?is)<meta\b[^>]*\b(?:name|property)\s*=\s*['\"](?:generator|framework|build)['\"][^>]*>"
        ),
        "framework or generator metadata",
    ),
    (
        "local-windows-path",
        re.compile(r"(?i)(?<![\w:])[a-z]:\\(?:users|documents|repos|work|temp|windows)\\"),
        "local Windows filesystem path",
    ),
    (
        "local-unix-path",
        re.compile(r"(?<![\w:])/(?:home|Users|fast|var/www|srv|opt|private/tmp)(?:/|\b)"),
        "local Unix filesystem path",
    ),
    (
        "internal-hostname",
        re.compile(r"(?i)\b(?:hpubuntu|cottageserver)(?:\.[a-z0-9.-]+)?\b|\b[a-z0-9-]+\.ts\.net\b"),
        "internal infrastructure hostname",
    ),
    (
        "environment-dump",
        re.compile(r"(?i)\b(?:process\.env|import\.meta\.env|deno\.env|os\.environ|phpinfo\s*\()"),
        "runtime environment access or dump marker",
    ),
    (
        "debug-code",
        re.compile(r"(?i)(?<![\w-])debugger\s*;"),
        "debugger statement",
    ),
    (
        "framework-dev-marker",
        re.compile(r"(?i)(?:webpack://|/@vite/client\b|react-refresh|__NEXT_DATA__|data-sveltekit)"),
        "development or framework build marker",
    ),
    (
        "git-revision",
        re.compile(
            r"(?i)\b(?:git(?:[-_ ]?(?:sha|commit))?|commit|revision)\b.{0,24}\b[0-9a-f]{7,40}\b"
        ),
        "Git revision identifier",
    ),
    (
        "secret-private-key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "private-key material",
    ),
    (
        "secret-token-shape",
        re.compile(
            r"(?i)\b(?:sk-[a-z0-9_-]{16,}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b"
        ),
        "provider token or access-key shape",
    ),
    (
        "secret-assignment",
        re.compile(
            r"(?i)\b(?:api[-_]?key|client[-_]?secret|access[-_]?token|password)\s*[:=]\s*(?:"
            r"(?P<quote>['\"])[^'\"\r\n]{12,}(?P=quote)|"
            r"(?=[a-z0-9_./+\-=]{20,}\b)(?=[a-z0-9_./+\-=]*\d)[a-z0-9_./+\-=]{20,})"
        ),
        "secret-like assignment",
    ),
    ("ai-provider-openai", re.compile(r"(?i)\b(?:openai|chatgpt|gpt-[345][a-z0-9.-]*)\b"), "OpenAI model/provider name"),
    ("ai-provider-anthropic", re.compile(r"(?i)\b(?:anthropic|claude(?:-[a-z0-9.-]+)?)\b"), "Anthropic model/provider name"),
    ("ai-provider-gemini", re.compile(r"(?i)\bgemini(?:-[a-z0-9.-]+)?\b"), "Gemini model/provider name"),
    ("ai-provider-copilot", re.compile(r"(?i)\b(?:github\s+)?copilot\b"), "Copilot provider name"),
    ("ai-provider-ollama", re.compile(r"(?i)\bollama\b"), "Ollama provider name"),
    ("ai-provider-llama", re.compile(r"(?i)\bllama(?:[- ]?\d[\w.-]*)?\b"), "Llama model name"),
    ("ai-provider-kokoro", re.compile(r"(?i)\bkokoro\b"), "Kokoro model/provider name"),
)

COMMENT_RULE = re.compile(
    r"(?i)\b(?:prompt|model|provider|generated by|generator|chatgpt|openai|anthropic|claude|gemini|copilot|ollama|llama|kokoro|vite|webpack|react|astro|svelte)\b"
)
HTML_COMMENT = re.compile(r"<!--(.*?)-->", re.DOTALL)
CSS_URL = re.compile(r"(?i)url\(\s*(['\"]?)(.*?)\1\s*\)")
JS_IMPORT = re.compile(r"(?i)(?:from\s*|import\s*\(|importScripts\s*\()['\"]([^'\"]+)['\"]")

PDF_PRIVATE_KEYS = (
    b"/Producer",
    b"/Creator",
    b"/CreationDate",
    b"/ModDate",
    b"/Metadata",
    b"/EmbeddedFiles",
)
MP4_PRIVATE_MARKERS = (
    b"Google Inc.",
    b"Adobe Premiere",
    b"DaVinci Resolve",
    b"creation_time",
    b"x264 - core",
)
MP4_VERSION_MARKERS = (
    re.compile(rb"Lavf\d+(?:\.\d+)+"),
    re.compile(rb"Lavc\d+(?:\.\d+)+"),
)

DEFAULT_PUBLIC_ROUTES = (
    "/murmuration.html",
    "/cv.html",
    "/LawrenceKnowlesProfessionalProfile.pdf",
    "/lincoln-course-match/",
    "/cartoon-collingham/",
    "/university-buddy-matcher-demo.mp4",
)
NEGATIVE_PROBES = (
    "/.env",
    "/.git/HEAD",
    "/.htaccess",
    "/debug",
    "/server-info",
    "/server-status",
    "/README.md",
    "/CHANGELOG.md",
    "/SECURITY.md",
    "/package.json",
    "/package-lock.json",
    "/vite.config.js",
    "/manifest.json",
    "/asset-manifest.json",
    "/index.html.map",
    "/assets/",
    "/releases/",
    "/lincoln-course-match/README.md",
    "/lincoln-course-match/README.txt",
    "/lincoln-course-match/ARCHITECTURE.md",
    "/lincoln-course-match/CHANGELOG.md",
)


def normalise_path(value: str) -> str:
    return value.replace("\\", "/").lstrip("/") or "."


def load_allowlist(path: Path | None) -> list[AllowEntry]:
    if path is None:
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("version") != 1 or not isinstance(raw.get("entries"), list):
        raise ValueError(f"Unsupported allowlist format: {path}")
    entries: list[AllowEntry] = []
    for item in raw["entries"]:
        if not all(isinstance(item.get(key), str) and item[key] for key in ("code", "path", "reason")):
            raise ValueError(f"Invalid allowlist entry in {path}")
        entries.append(AllowEntry(item["code"], normalise_path(item["path"]), item["reason"]))
    return entries


def split_allowed(findings: Iterable[Finding], allowlist: Iterable[AllowEntry]) -> tuple[list[Finding], list[tuple[Finding, str]]]:
    blocked: list[Finding] = []
    allowed: list[tuple[Finding, str]] = []
    entries = list(allowlist)
    for finding in sorted(set(findings)):
        match = next(
            (
                item
                for item in entries
                if item.code == finding.code and fnmatch.fnmatch(normalise_path(finding.path), item.path)
            ),
            None,
        )
        if match:
            allowed.append((finding, match.reason))
        else:
            blocked.append(finding)
    return blocked, allowed


def scan_text(path: str, text: str) -> list[Finding]:
    findings: list[Finding] = []
    for code, pattern, detail in TEXT_RULES:
        if pattern.search(text):
            findings.append(Finding(path, code, detail))

    for match in IPV4.finditer(text):
        try:
            address = ipaddress.ip_address(match.group(0))
        except ValueError:
            continue
        carrier_grade_nat = address in ipaddress.ip_network("100.64.0.0/10")
        if address.is_private or address.is_loopback or address.is_link_local or carrier_grade_nat:
            findings.append(Finding(path, "internal-ip-address", "private, loopback, link-local, or carrier-grade NAT address"))
            break

    if path.lower().endswith((".html", ".htm")):
        for comment in HTML_COMMENT.findall(text):
            if COMMENT_RULE.search(comment) or any(
                pattern.search(comment)
                for code, pattern, _ in TEXT_RULES
                if code in {"local-windows-path", "local-unix-path", "internal-hostname", "internal-ip-address"}
            ):
                findings.append(Finding(path, "revealing-html-comment", "HTML comment contains build, provider, prompt, model, or infrastructure detail"))
                break
    return findings


def scan_jpeg(path: str, data: bytes) -> list[Finding]:
    findings: list[Finding] = []
    if not data.startswith(b"\xff\xd8"):
        return findings
    offset = 2
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            break
        marker = data[offset + 1]
        offset += 2
        if marker in {0xD9, 0xDA}:
            break
        if marker in {0x00, 0x01} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        length = struct.unpack(">H", data[offset : offset + 2])[0]
        if length < 2 or offset + length > len(data):
            break
        payload = data[offset + 2 : offset + length]
        if marker == 0xE1:
            label = "EXIF or XMP application metadata"
            findings.append(Finding(path, "image-metadata", label))
        elif marker == 0xED:
            findings.append(Finding(path, "image-metadata", "IPTC/Photoshop application metadata"))
        elif marker == 0xFE:
            findings.append(Finding(path, "image-comment", "JPEG comment metadata"))
        offset += length
    return findings


def scan_png(path: str, data: bytes) -> list[Finding]:
    findings: list[Finding] = []
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return findings
    offset = 8
    private_chunks = {b"eXIf", b"iTXt", b"tEXt", b"tIME", b"zTXt"}
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        if kind in private_chunks:
            findings.append(Finding(path, "image-metadata", f"PNG {kind.decode('ascii', 'replace')} metadata chunk"))
        offset += 12 + length
        if kind == b"IEND":
            break
    return findings


def scan_binary(path: str, data: bytes) -> list[Finding]:
    lower = path.lower()
    findings: list[Finding] = []
    if lower.endswith((".jpg", ".jpeg")):
        findings.extend(scan_jpeg(path, data))
    elif lower.endswith(".png"):
        findings.extend(scan_png(path, data))
    elif lower.endswith(".pdf"):
        for key in PDF_PRIVATE_KEYS:
            if key in data:
                findings.append(Finding(path, "pdf-private-metadata", f"PDF contains {key.decode('ascii')} metadata"))
    elif lower.endswith(".mp3"):
        if data.startswith(b"ID3") or data[-128:-125] == b"TAG" or b"APETAGEX" in data[:64] + data[-256:]:
            findings.append(Finding(path, "audio-metadata", "MP3 contains ID3 or APE metadata"))
    elif lower.endswith((".mp4", ".m4v", ".mov")):
        for marker in MP4_PRIVATE_MARKERS:
            if marker.lower() in data.lower():
                findings.append(Finding(path, "video-private-metadata", "video contains encoder/provider or creation metadata"))
                break
        if any(pattern.search(data) for pattern in MP4_VERSION_MARKERS):
            findings.append(Finding(path, "video-encoder-version", "video contains an encoder version marker"))
    return findings


def filename_findings(path: str) -> list[Finding]:
    findings: list[Finding] = []
    normalised = normalise_path(path)
    parts = [part.lower() for part in Path(normalised).parts]
    name = parts[-1]
    if any(part in SOURCE_ONLY_PARTS for part in parts):
        findings.append(Finding(normalised, "source-only-path", "source, test, configuration, dependency, or VCS directory"))
    if name in SOURCE_ONLY_NAMES or name.endswith((".bak", ".log", ".old", ".orig", "~")):
        findings.append(Finding(normalised, "source-only-file", "source, documentation, lock, log, or backup file"))
    if name.endswith(".map"):
        findings.append(Finding(normalised, "source-map-file", "production source-map file"))
    if MANIFEST_NAME.search(name):
        findings.append(Finding(normalised, "build-manifest", "build or asset manifest"))
    if any(part == "releases" or BACKUP_PART.search(part) for part in parts):
        findings.append(Finding(normalised, "published-rollback", "release or rollback material inside the publication root"))
    if any(part.startswith(".") for part in parts) and name != ".htaccess":
        findings.append(Finding(normalised, "hidden-file", "hidden file or directory in publication artefact"))
    return findings


def scan_artifact(root: Path) -> list[Finding]:
    root = root.resolve()
    if not root.is_dir():
        return [Finding(str(root), "missing-artifact", "publication artefact directory does not exist")]
    findings: list[Finding] = []
    text_files: dict[str, tuple[str, str]] = {}
    published_files = {
        normalise_path(str(path.relative_to(root)))
        for path in root.rglob("*")
        if path.is_file() and not path.is_symlink()
    }
    for path in sorted(root.rglob("*")):
        rel = normalise_path(str(path.relative_to(root)))
        findings.extend(filename_findings(rel))
        if path.is_symlink():
            findings.append(Finding(rel, "symlink", "symbolic links are not allowed in the publication artefact"))
            continue
        if not path.is_file():
            continue
        try:
            data = path.read_bytes()
        except OSError:
            findings.append(Finding(rel, "unreadable-file", "publication file could not be read"))
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name == ".htaccess":
            text = data.decode("utf-8", errors="replace")
            findings.extend(scan_text(rel, text))
            content_type = (
                "text/html"
                if path.suffix.lower() in {".html", ".htm"}
                else "text/css"
                if path.suffix.lower() == ".css"
                else "text/javascript"
                if path.suffix.lower() in {".js", ".mjs"}
                else "text/plain"
            )
            text_files[rel] = (text, content_type)
        findings.extend(scan_binary(rel, data))

    virtual_prefixes = ("assets/videos/",)
    for rel, (text, content_type) in text_files.items():
        if content_type == "text/plain":
            continue
        parent = posixpath.dirname(rel)
        for link in link_candidates(text, content_type):
            if link.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
                continue
            split = urlsplit(link)
            if split.scheme or split.netloc:
                continue
            target = split.path
            if not target:
                continue
            if target.startswith("/"):
                target = target.lstrip("/")
            else:
                target = posixpath.normpath(posixpath.join(parent, target))
            if target in {"", "."}:
                target = "index.html"
            if target.endswith("/"):
                target += "index.html"
            if target in published_files or f"{target}/index.html" in published_files:
                continue
            if any(target.startswith(prefix) for prefix in virtual_prefixes):
                continue
            findings.append(Finding(rel, "broken-artifact-link", f"internal reference is absent from the artefact: {target}"))
    return sorted(set(findings))


def canonical_url(url: str) -> str:
    clean, _ = urldefrag(url)
    split = urlsplit(clean)
    path = split.path or "/"
    return urlunsplit((split.scheme.lower(), split.netloc.lower(), path, split.query, ""))


def same_site(first: str, second: str) -> bool:
    first_host = (urlsplit(first).hostname or "").lower().removeprefix("www.")
    second_host = (urlsplit(second).hostname or "").lower().removeprefix("www.")
    return first_host == second_host and urlsplit(second).scheme in {"http", "https"}


def response_path(url: str) -> str:
    split = urlsplit(url)
    return normalise_path(split.path)


def decode_text(data: bytes, content_type: str) -> str:
    match = re.search(r"(?i)charset=([a-z0-9._-]+)", content_type)
    charset = match.group(1) if match else "utf-8"
    try:
        return data.decode(charset, errors="replace")
    except LookupError:
        return data.decode("utf-8", errors="replace")


def fetch(url: str, *, byte_range: str | None = None, limit: int = 8 * 1024 * 1024) -> tuple[int, str, dict[str, str], bytes, bool]:
    headers = {
        "User-Agent": "lozknowles-publication-privacy/1.0",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    if byte_range:
        headers["Range"] = byte_range
    request = Request(url, headers=headers)
    try:
        response = urlopen(request, timeout=10)
    except HTTPError as error:
        response = error
    status = int(getattr(response, "status", getattr(response, "code", 0)))
    final_url = response.geturl()
    response_headers = {key.lower(): value for key, value in response.headers.items()}
    data = response.read(limit + 1)
    truncated = len(data) > limit
    if truncated:
        data = data[:limit]
    response.close()
    return status, final_url, response_headers, data, truncated


def link_candidates(text: str, content_type: str) -> set[str]:
    links: set[str] = set()
    if "html" in content_type:
        parser = LinkCollector()
        parser.feed(text)
        links.update(parser.links)
    if "css" in content_type:
        links.update(match.group(2) for match in CSS_URL.finditer(text))
    if "javascript" in content_type or "ecmascript" in content_type:
        links.update(
            match.group(1)
            for match in JS_IMPORT.finditer(text)
            if match.group(1).startswith(("./", "../", "/"))
        )
    return {link.strip() for link in links if link.strip()}


def security_header_findings(path: str, status: int, content_type: str, headers: dict[str, str]) -> list[Finding]:
    findings: list[Finding] = []
    server = headers.get("server", "")
    if server and ("/" in server or "(" in server or re.search(r"\b\d+(?:\.\d+)+\b", server)):
        findings.append(Finding(path, "revealing-server-header", "server header exposes software version or operating-system detail"))
    for header in ("x-powered-by", "x-generator", "x-runtime", "x-version", "x-git-commit", "sourcemap", "x-sourcemap"):
        if header in headers:
            findings.append(Finding(path, "revealing-response-header", f"response exposes {header}"))
    if status == 200 and "text/html" in content_type:
        required = {
            "content-security-policy": "Content-Security-Policy",
            "x-content-type-options": "X-Content-Type-Options",
            "referrer-policy": "Referrer-Policy",
            "permissions-policy": "Permissions-Policy",
        }
        for header, label in required.items():
            if not headers.get(header):
                findings.append(Finding(path, "missing-security-header", f"HTML response is missing {label}"))
    return findings


def scan_site(base_url: str, *, includes: Iterable[str] = (), max_urls: int = 250) -> list[Finding]:
    split = urlsplit(base_url)
    if split.scheme not in {"http", "https"} or not split.netloc:
        return [Finding(base_url, "invalid-site-url", "site URL must be absolute HTTP(S) URL")]
    base = base_url.rstrip("/") + "/"
    seeds = [base]
    seeds.extend(urljoin(base, route.lstrip("/")) for route in DEFAULT_PUBLIC_ROUTES)
    seeds.extend(urljoin(base, route) for route in includes)
    queue = deque(canonical_url(url) for url in seeds)
    visited: set[str] = set()
    findings: list[Finding] = []
    servers: set[str] = set()
    derived_map_urls: set[str] = set()

    def fetch_public(url: str):
        binary_media = urlsplit(url).path.lower().endswith((".mp4", ".m4v", ".mov"))
        result = fetch(
            url,
            byte_range="bytes=0-2097151" if binary_media else None,
            limit=2 * 1024 * 1024 if binary_media else 8 * 1024 * 1024,
        )
        return binary_media, result

    with ThreadPoolExecutor(max_workers=10) as executor:
        while queue and len(visited) < max_urls:
            batch: list[str] = []
            while queue and len(batch) < 20 and len(visited) + len(batch) < max_urls:
                url = queue.popleft()
                if url in visited or url in batch or not same_site(base, url):
                    continue
                batch.append(url)
            if not batch:
                continue
            visited.update(batch)
            futures = {executor.submit(fetch_public, url): url for url in batch}
            completed: list[tuple[str, object]] = []
            for future in as_completed(futures):
                url = futures[future]
                try:
                    completed.append((url, future.result()))
                except (OSError, URLError) as error:
                    findings.append(Finding(response_path(url), "fetch-failed", f"request failed: {error.__class__.__name__}"))

            for url, result in sorted(completed):
                binary_media, response = result
                status, final_url, headers, data, truncated = response
                path = response_path(url)
                if not same_site(base, final_url):
                    findings.append(Finding(path, "external-redirect", "internal URL redirects to another site"))
                    continue
                if status not in {200, 206}:
                    findings.append(Finding(path, "broken-public-url", f"linked or seeded URL returned HTTP {status}"))
                    continue
                content_type = headers.get("content-type", "").lower()
                server = headers.get("server", "").strip()
                if server:
                    servers.add(server)
                findings.extend(security_header_findings(path, status, content_type, headers))

                if binary_media:
                    sample = data
                    content_range = headers.get("content-range", "")
                    total_match = re.search(r"/(\d+)$", content_range)
                    if total_match and int(total_match.group(1)) > len(data):
                        total = int(total_match.group(1))
                        start = max(0, total - 2 * 1024 * 1024)
                        try:
                            _, _, _, tail, _ = fetch(
                                url,
                                byte_range=f"bytes={start}-{total - 1}",
                                limit=2 * 1024 * 1024,
                            )
                            sample += tail
                        except (OSError, URLError):
                            findings.append(Finding(path, "media-tail-fetch-failed", "could not inspect the end of the media file"))
                    findings.extend(scan_binary(path, sample))
                    continue

                textual = (
                    content_type.startswith("text/")
                    or "javascript" in content_type
                    or "json" in content_type
                    or "xml" in content_type
                    or urlsplit(url).path.lower().endswith(tuple(TEXT_SUFFIXES))
                )
                if textual:
                    if truncated:
                        findings.append(Finding(path, "response-too-large", "text response exceeded the inspection limit"))
                    text = decode_text(data, content_type)
                    findings.extend(scan_text(path, text))
                    for link in link_candidates(text, content_type):
                        if link.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
                            continue
                        candidate = canonical_url(urljoin(final_url, link))
                        if same_site(base, candidate) and candidate not in visited:
                            queue.append(candidate)
                    if urlsplit(url).path.lower().endswith((".js", ".css")):
                        derived_map_urls.add(canonical_url(url + ".map"))
                else:
                    findings.extend(scan_binary(path, data))

    if queue:
        findings.append(Finding(".", "crawl-limit", f"crawl exceeded {max_urls} internal URLs"))

    error_hashes: dict[str, list[str]] = {}
    probe_urls = {
        canonical_url(urljoin(base, probe.lstrip("/")))
        for probe in tuple(NEGATIVE_PROBES) + tuple(urlsplit(url).path for url in sorted(derived_map_urls))
    }
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(fetch, url, limit=512 * 1024): url for url in probe_urls}
        probe_results: list[tuple[str, object]] = []
        for future in as_completed(futures):
            url = futures[future]
            try:
                probe_results.append((url, future.result()))
            except (OSError, URLError) as error:
                findings.append(Finding(response_path(url), "negative-probe-failed", f"negative probe failed: {error.__class__.__name__}"))

    for url, response in sorted(probe_results):
        path = response_path(url)
        status, _, headers, data, _ = response
        server = headers.get("server", "").strip()
        if server:
            servers.add(server)
        findings.extend(security_header_findings(path, status, headers.get("content-type", "").lower(), headers))
        if status not in {403, 404, 410}:
            findings.append(Finding(path, "public-leak-path", f"sensitive or source-only path returned HTTP {status}"))
        else:
            digest = hashlib.sha256(data).hexdigest()
            error_hashes.setdefault(digest, []).append(path)
            findings.extend(scan_text(path, decode_text(data, headers.get("content-type", ""))))

    if len(error_hashes) > 1:
        findings.append(Finding(".", "inconsistent-error-body", "negative probes returned more than one error body"))
    if len(servers) > 1:
        findings.append(Finding(".", "inconsistent-server-header", "responses exposed inconsistent Server header values"))
    return sorted(set(findings))


def print_results(findings: Iterable[Finding], allowlist: Iterable[AllowEntry]) -> int:
    blocked, allowed = split_allowed(findings, allowlist)
    for finding, reason in allowed:
        print(f"ALLOW {finding.code}: {finding.path} ({reason})")
    for finding in blocked:
        print(f"FAIL  {finding.code}: {finding.path} ({finding.detail})")
    if blocked:
        print(f"Publication privacy check FAILED: {len(blocked)} blocking finding(s), {len(allowed)} reviewed allowance(s).")
        return 1
    print(f"Publication privacy check PASSED: 0 blocking findings, {len(allowed)} reviewed allowance(s).")
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allowlist", type=Path, help="JSON file containing reviewed path-and-rule allowances")
    subparsers = parser.add_subparsers(dest="mode", required=True)
    artifact = subparsers.add_parser("artifact", help="scan a finished publication directory")
    artifact.add_argument("root", type=Path)
    site = subparsers.add_parser("site", help="crawl and probe a deployed site")
    site.add_argument("base_url")
    site.add_argument("--include", action="append", default=[], help="additional public route to seed")
    site.add_argument("--max-urls", type=int, default=250)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        allowlist = load_allowlist(args.allowlist)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Could not load allowlist: {error}", file=sys.stderr)
        return 2
    if args.mode == "artifact":
        findings = scan_artifact(args.root)
    else:
        findings = scan_site(args.base_url, includes=args.include, max_urls=args.max_urls)
    return print_results(findings, allowlist)


if __name__ == "__main__":
    raise SystemExit(main())
