import json
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from scripts import wopr_health_collect


ROOT = pathlib.Path(__file__).resolve().parents[1]
RECEIVER = (ROOT / 'scripts/wopr_health_receive.py').read_text()


class PowerBoundary(unittest.TestCase):
    def test_plug_timeout_preserves_server_data(self):
        now = int(time.time())
        server = {'sampled_at': now, 'values': [12.0] * 6}
        with patch.object(wopr_health_collect, 'sample', return_value=server), \
             patch.object(wopr_health_collect.subprocess, 'run', side_effect=subprocess.TimeoutExpired('plug', 5)):
            result = wopr_health_collect.collect()
        self.assertEqual(result['servers']['H'], server)
        self.assertEqual(result['values'], server['values'])
        self.assertIsNone(result['power']['wopr'])

    def publish(self, power):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'dist').mkdir()
            source = RECEIVER.replace(
                "root=Path('/var/www/lozknowles.com/public_html/dist')",
                f'root=Path({str(root / "dist")!r})',
            )
            now = int(time.time())
            data = {'version': 1, 'sampled_at': now, 'values': [None] * 6,
                    'power': {'wopr': power}}
            result = subprocess.run([sys.executable, '-c', source],
                                    input=json.dumps(data), text=True,
                                    capture_output=True)
            output = root / 'dist/wopr-health.json'
            return result.returncode, json.loads(output.read_text()) if output.exists() else None

    def test_zero_is_valid_and_public_schema_is_bounded(self):
        now = int(time.time())
        code, output = self.publish({'watts': 0.0, 'observed_at': now})
        self.assertEqual(code, 0)
        self.assertEqual(output['power'], {'wopr': {'watts': 0.0, 'observed_at': now}})

    def test_missing_sample_is_unavailable(self):
        code, output = self.publish(None)
        self.assertEqual(code, 0)
        self.assertIsNone(output['power']['wopr'])

    def test_stale_and_extra_private_fields_are_rejected(self):
        now = int(time.time())
        for sample in ({'watts': 10, 'observed_at': now - 60},
                       {'watts': 10, 'observed_at': now, 'local_key': 'secret'}):
            with self.subTest(sample=sample):
                code, output = self.publish(sample)
                self.assertNotEqual(code, 0)
                self.assertIsNone(output)


if __name__ == '__main__':
    unittest.main()
