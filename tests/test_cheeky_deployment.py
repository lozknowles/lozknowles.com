import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cheeky_deploy', Path(__file__).parents[1] / 'scripts/apply-cheeky-phone.py')
deploy = importlib.util.module_from_spec(spec); spec.loader.exec_module(deploy)

class CheekyDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(); self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'site'; self.stage = Path(self.directory.name) / 'stage'
        (self.root/'assets').mkdir(parents=True); (self.stage/'new/assets').mkdir(parents=True)
        (self.root/'index.html').write_text('independent homepage')
        (self.root/'unrelated.html').write_text('leave alone')
        names = ['cheeky-phone.html'] + ['assets/cheeky-'+n for n in ['phone.css','phone.js','water.js','scene.js','lines.js','clips.js','audio.js','george.mp3']]
        self.entries=[]
        for i, name in enumerate(names):
            old = b'old runtime' if i < 3 else None
            if old: (self.root/name).write_bytes(old)
            new = ('reviewed '+name).encode(); (self.stage/'new'/name).write_bytes(new)
            self.entries.append(dict(path=name,baseline=hashlib.sha256(old).hexdigest() if old else None,sha256=hashlib.sha256(new).hexdigest()))
        (self.stage/'runtime.json').write_text(json.dumps(self.entries))
    def test_scoped_install_preserves_unrelated_routes(self):
        deploy.apply(self.root,self.stage)
        self.assertEqual((self.root/'index.html').read_text(),'independent homepage')
        self.assertEqual((self.root/'unrelated.html').read_text(),'leave alone')
        for e in self.entries: self.assertEqual(deploy.digest(self.root/e['path']),e['sha256'])
        self.assertEqual((self.stage/'backup/cheeky-phone.html').read_bytes(),b'old runtime')
    def test_drift_is_rejected_before_any_replacement(self):
        (self.root/'assets/cheeky-phone.js').write_text('independent change')
        with self.assertRaisesRegex(RuntimeError,'drift'): deploy.apply(self.root,self.stage)
        self.assertEqual((self.root/'cheeky-phone.html').read_bytes(),b'old runtime')
        self.assertFalse((self.stage/'backup').exists())
    def test_payload_mismatch_is_rejected(self):
        (self.stage/'new/assets/cheeky-george.mp3').write_bytes(b'not reviewed')
        with self.assertRaisesRegex(RuntimeError,'payload'): deploy.apply(self.root,self.stage)
    def test_transfer_exception_rolls_back_only_applied_files(self):
        original = deploy.os.replace; calls = 0
        def fail_once(source, target):
            nonlocal calls
            calls += 1
            if calls == 4: raise OSError('simulated transfer failure')
            return original(source, target)
        with patch.object(deploy.os,'replace',fail_once):
            with self.assertRaises(OSError): deploy.apply(self.root,self.stage)
        for e in self.entries: self.assertEqual(deploy.digest(self.root/e['path']),e['baseline'])
    def test_backup_in_public_tree_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'outside'): deploy.apply(self.root,self.root/'stage')
