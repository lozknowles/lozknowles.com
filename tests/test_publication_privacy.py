from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.build_course_matcher_publication import strip_source_map_directive
from scripts.publication_privacy import Finding, scan_artifact, scan_text, split_allowed, AllowEntry


class PublicationPrivacyTests(unittest.TestCase):
    def test_clean_static_file_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text(
                "<!doctype html><html><head><title>Clean</title></head><body>Public content</body></html>",
                encoding="utf-8",
            )
            self.assertEqual(scan_artifact(root), [])

    def test_source_map_and_local_path_fail(self) -> None:
        findings = scan_text(
            "assets/site.js",
            r"const p = 'C:\Users\person\work';" + "\n//# sourceMappingURL=site.js.map",
        )
        codes = {finding.code for finding in findings}
        self.assertIn("local-windows-path", codes)
        self.assertIn("source-map-reference", codes)

    def test_pdf_private_metadata_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "profile.pdf").write_bytes(b"%PDF-1.4\n/Title (Public) /Producer (tool) /CreationDate (today)\n%%EOF")
            codes = {finding.code for finding in scan_artifact(root)}
            self.assertIn("pdf-private-metadata", codes)

    def test_jpeg_exif_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = b"Exif\x00\x00test"
            segment = b"\xff\xe1" + (len(payload) + 2).to_bytes(2, "big") + payload
            (root / "image.jpg").write_bytes(b"\xff\xd8" + segment + b"\xff\xd9")
            codes = {finding.code for finding in scan_artifact(root)}
            self.assertIn("image-metadata", codes)

    def test_missing_internal_asset_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text('<script src="/assets/missing.js"></script>', encoding="utf-8")
            codes = {finding.code for finding in scan_artifact(root)}
            self.assertIn("broken-artifact-link", codes)

    def test_reviewed_allowance_is_path_and_rule_specific(self) -> None:
        findings = [Finding("experiment/assets/site.js", "ai-provider-kokoro", "provider")]
        allowed = [AllowEntry("ai-provider-kokoro", "experiment/assets/*.js", "intentional attribution")]
        blocked, reviewed = split_allowed(findings, allowed)
        self.assertEqual(blocked, [])
        self.assertEqual(len(reviewed), 1)

    def test_variable_named_password_is_not_a_secret_literal(self) -> None:
        findings = scan_text("vendor/library.js", "password = source.password")
        self.assertNotIn("secret-assignment", {finding.code for finding in findings})

    def test_quoted_secret_literal_fails(self) -> None:
        findings = scan_text("assets/config.js", "apiKey = 'literal-value-1234567890'")
        self.assertIn("secret-assignment", {finding.code for finding in findings})

    def test_source_map_directive_is_removed_from_generated_vendor_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "vendor.js"
            path.write_bytes(b"console.log('runtime');\n//# sourceMappingURL=vendor.js.map\n")
            strip_source_map_directive(path)
            self.assertEqual(path.read_bytes(), b"console.log('runtime');\n")


if __name__ == "__main__":
    unittest.main()
