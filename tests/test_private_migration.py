import importlib.util,sys,unittest,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from migrate_private import recover
class PrivateMigrationTests(unittest.TestCase):
 def setUp(self):
  self.url='https://www.linkedin.com/jobs/view/4456195986';self.id=hashlib.sha256(self.url.encode()).hexdigest()[:24]
  self.data={'jobs':[{'id':self.id,'title':'Public title','company':'Public company'}]}
  self.row='<tr data-applied="{flag}"><td class="company">Public company</td><td><a class="rowlink" href="https://uk.linkedin.com/jobs/view/example-4456195986">Open</a></td></tr>'
 def test_explicit_marker_only(self):self.assertEqual(recover(self.row.format(flag='0'),self.data),{})
 def test_recovers_marker_without_fabricating_applied_date(self):
  v=recover(self.row.format(flag='1'),self.data)[self.id];self.assertEqual(v['status'],'applied');self.assertNotIn('appliedAt',v);self.assertEqual(v['history'],[])
 def test_unknown_identity_not_invented(self):self.assertEqual(recover(self.row.format(flag='1'),{'jobs':[]}),{})
 def test_private_narrative_not_copied(self):
  v=recover('<p>SECRET_CANDIDATE_NARRATIVE</p>'+self.row.format(flag='1'),self.data);self.assertNotIn('SECRET_CANDIDATE_NARRATIVE',str(v))
if __name__=='__main__':unittest.main()
