from pathlib import Path
import re
import unittest

from scripts.build_publication import ASSET_FILES

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
        self.assertEqual(len(files),6)
        self.assertNotIn('index.html',files)
        self.assertNotIn('.htaccess',files)
        self.assertIn('BASELINE_ARCADE_SHA256',script)

if __name__=='__main__':
    unittest.main()
