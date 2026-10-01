import pathlib,unittest
from scripts.build_publication import ROOT_FILES,ASSET_FILES
ROOT=pathlib.Path(__file__).resolve().parents[1]
class WoprBoundary(unittest.TestCase):
 def test_private_controller_is_not_publication_input(self):
  self.assertFalse(any('wopr_control' in p for p in (*ROOT_FILES,*ASSET_FILES)))
  page=(ROOT/'wopr-light-display.html').read_text();js=(ROOT/'assets/wopr-light-display.js').read_text()
  for text in ('/api/sessions','/ws','wopr_session','private_key','.ts.net'):
   self.assertNotIn(text,page+js)
 def test_regression_status_is_fetched_in_both_modes(self):
  js=(ROOT/'assets/wopr-light-display.js').read_text()
  self.assertIn('fetchHealth();healthPoll=setInterval(fetchHealth,10000)',js)
  self.assertNotIn('if(serverMode){fetchHealth()',js)
  self.assertIn("['M','MSI']",js);self.assertIn("['A','macomarchy']",js)
