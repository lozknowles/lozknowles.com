from pathlib import Path

from scripts.build_publication import ASSET_FILES, ROOT_FILES


def test_openai_integration_is_not_a_publication_input():
    assert all('private/' not in item for item in (*ROOT_FILES, *ASSET_FILES))
    package = Path(__file__).resolve().parents[1] / 'private' / 'filestore-openai-usage'
    assert (package / 'integration.patch').is_file()
    assert (package / 'overlay' / 'app' / 'openai_usage.py').is_file()
