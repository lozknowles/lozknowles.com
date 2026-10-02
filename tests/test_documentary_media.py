import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_publication as publication


class DocumentaryMediaTests(unittest.TestCase):
    def test_only_pinned_media_can_enter_the_public_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'config').mkdir()
            film = root / 'approved.mp4'
            film.write_bytes(b'reviewed media fixture')
            spec = {
                'path': 'assets/videos/reading-the-landscape-v3.mp4',
                'bytes': film.stat().st_size,
                'sha256': hashlib.sha256(film.read_bytes()).hexdigest(),
            }
            config = root / 'config/documentary-media.json'
            config.write_text(json.dumps(spec))
            with patch.object(publication, 'ROOT', root):
                publication.copy_documentary_media(film, root / 'output')
                target = root / 'output' / spec['path']
                self.assertEqual(target.read_bytes(), film.read_bytes())
                film.write_bytes(b'unreviewed replacement')
                with self.assertRaisesRegex(ValueError, 'reviewed film'):
                    publication.copy_documentary_media(film, root / 'output')
                self.assertEqual(target.read_bytes(), b'reviewed media fixture')
                spec['path'] = '../escaped.mp4'
                config.write_text(json.dumps(spec))
                with self.assertRaisesRegex(ValueError, 'destination'):
                    publication.copy_documentary_media(film, root / 'output')
                self.assertFalse((root / 'escaped.mp4').exists())
