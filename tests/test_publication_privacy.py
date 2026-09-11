from __future__ import annotations

import os
import stat
import tempfile
import unittest
from pathlib import Path

from scripts.build_publication import ASSET_FILES, ROOT_FILES
from scripts.build_course_matcher_publication import strip_source_map_directive
from scripts.build_publication import normalise_public_permissions
from scripts.publication_privacy import Finding, scan_artifact, scan_text, split_allowed, AllowEntry, source_map_probe_url


class PublicationPrivacyTests(unittest.TestCase):
    def test_versioned_assets_probe_the_map_path_not_the_runtime_asset(self) -> None:
        for asset in ("arcade.css", "arcade.js"):
            for suffix in ("", "?v=20260911-1", "?v=20260911-1#section"):
                with self.subTest(asset=asset, suffix=suffix):
                    self.assertEqual(
                        source_map_probe_url(f"https://example.test/assets/{asset}{suffix}"),
                        f"https://example.test/assets/{asset}.map",
                    )

    def test_html_responses_require_revalidation(self) -> None:
        htaccess = (Path(__file__).parents[1] / ".htaccess").read_text(
            encoding="utf-8"
        )
        self.assertIn('<FilesMatch "\\.html$">', htaccess)
        self.assertIn('Cache-Control "no-cache, must-revalidate"', htaccess)

    def test_cv_links_packaged_reference_carousel(self) -> None:
        root = Path(__file__).parents[1]
        profile = (root / "cv.html").read_text(encoding="utf-8")
        references = (root / "references.html").read_text(encoding="utf-8")

        self.assertIn('href="/references.html"', profile)
        self.assertIn("data-references-popup", profile)
        self.assertIn('/assets/cv.css?v=c0c5675', profile)
        self.assertIn('/assets/cv-page.js?v=5617094', profile)
        self.assertIn('/assets/cv.css?v=c0c5675', references)
        self.assertIn('/assets/references-page.js?v=64a84ae', references)
        self.assertEqual(references.count("data-reference-card"), 7)
        self.assertIn("Peter Collinson", references)
        self.assertIn("Sujee Saparamadu", references)
        self.assertNotIn("07553", references)
        self.assertNotIn("@tiscali.co.uk", references)
        self.assertIn("references.html", ROOT_FILES)
        self.assertIn("references-page.js", ASSET_FILES)

    def test_homepage_links_password_beta_as_voice_clone(self) -> None:
        homepage = (Path(__file__).parents[1] / "index.html").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            'href="https://www.lozknowles.com/voice-clone/"', homepage
        )
        self.assertIn("Voice Clone", homepage)

    def test_agent_control_showcase_exposes_three_reviewed_videos(self) -> None:
        showcase = (Path(__file__).parents[1] / "agent-control.html").read_text(
            encoding="utf-8"
        )
        self.assertEqual(showcase.count("<video controls playsinline"), 3)
        self.assertIn("/assets/videos/agent-control-overview.mp4", showcase)
        self.assertIn("/assets/videos/agent-control-live-run.mp4", showcase)
        self.assertIn("/assets/videos/agent-control-cache-qualification.mp4", showcase)
        self.assertIn("agent-control-live-run-transcript.html", showcase)
        self.assertIn("Jobs, Lanes, Sessions, Systems, Models, Routing, Crew, POE and Configuration", showcase)
        self.assertNotIn("autoplay", showcase)

    def test_agent_control_deployment_is_scoped_to_three_videos(self) -> None:
        root = Path(__file__).parents[1]
        deployment = (root / "scripts" / "deploy-agent-control.sh").read_text(
            encoding="utf-8"
        )
        applier = (root / "scripts" / "apply-agent-control-site.py").read_text(
            encoding="utf-8"
        )
        for name in (
            "agent-control-overview.mp4",
            "agent-control-live-run.mp4",
            "agent-control-cache-qualification.mp4",
        ):
            self.assertIn(name, deployment)
            self.assertIn(name, applier)

    @unittest.skipIf(os.name == "nt", "Windows does not preserve POSIX publication modes")
    def test_publication_permissions_are_web_readable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "publication"
            nested = root / "assets"
            nested.mkdir(parents=True, mode=0o700)
            asset = nested / "site.js"
            asset.write_text("void 0;", encoding="utf-8")
            asset.chmod(0o600)
            normalise_public_permissions(root)
            self.assertEqual(stat.S_IMODE(root.stat().st_mode), 0o755)
            self.assertEqual(stat.S_IMODE(nested.stat().st_mode), 0o755)
            self.assertEqual(stat.S_IMODE(asset.stat().st_mode), 0o644)

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
