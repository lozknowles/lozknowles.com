from pathlib import Path
import hashlib
import json
import re
import tempfile
import unittest
from unittest.mock import patch

from scripts.build_publication import ASSET_FILES, copy_arcade_media

ROOT=Path(__file__).resolve().parents[1]

class ArcadePublicationTests(unittest.TestCase):
    def test_cube_dependencies_are_same_origin_and_in_the_publication(self):
        html=(ROOT/'arcade.html').read_text(encoding='utf-8')
        self.assertNotIn('cdn.jsdelivr.net',html)
        self.assertIn('/assets/arcade-cube.js?',html)
        self.assertIn('arcade-cube.css',ASSET_FILES)
        self.assertIn('three-LICENSE.txt',ASSET_FILES)
        source=(ROOT/'assets/arcade-cube.js').read_text(encoding='utf-8')
        imports=re.findall(r"from ['\"]([^'\"]+)['\"]",source)
        self.assertEqual(len(imports),2)
        for dependency in imports:
            self.assertTrue(dependency.startswith('./'))
            name=dependency[2:].split('?')[0]
            self.assertIn(name,ASSET_FILES)
            self.assertTrue((ROOT/'assets'/name).is_file())

    def test_deploy_publishes_the_page_after_its_assets(self):
        script=(ROOT/'scripts/deploy-arcade-cube.sh').read_text(encoding='utf-8')
        files=script.split("<<'FILES'\n",1)[1].split('\nFILES',1)[0].splitlines()
        self.assertEqual(files[-1],'arcade.html')
        self.assertEqual(len(files),7)
        self.assertIn('assets/space-bike-gameplay.jpg',files)
        self.assertNotIn('assets/videos/space-bike-gameplay-v1.mp4',files)
        self.assertIn('MEDIA_ORIGIN',script)
        self.assertNotIn('index.html',files)
        self.assertNotIn('.htaccess',files)
        self.assertIn('BASELINE_ARCADE_SHA256',script)

    def test_release_refuses_changed_or_truncated_gameplay(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'config').mkdir()
            approved=b'reviewed gameplay edit'
            spec={'path':'assets/videos/space-bike-gameplay-v1.mp4',
                  'bytes':len(approved),'sha256':hashlib.sha256(approved).hexdigest()}
            (root/'config/arcade-media.json').write_text(json.dumps(spec))
            source=root/'source.mp4'
            with patch('scripts.build_publication.ROOT',root):
                for changed in (approved[:-1], b'X'+approved[1:]):
                    source.write_bytes(changed)
                    with self.assertRaisesRegex(ValueError,'reviewed gameplay edit'):
                        copy_arcade_media(source,root/'publication')
                self.assertFalse((root/'publication').exists())
                source.write_bytes(approved)
                copy_arcade_media(source,root/'publication')
                self.assertEqual((root/'publication'/spec['path']).read_bytes(),approved)

if __name__=='__main__':
    unittest.main()
