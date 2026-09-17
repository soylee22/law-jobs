import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build',ROOT/'scripts/build.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ImportTests(unittest.TestCase):
 def test_relative_morgan_link(self):
  self.assertEqual(m.canonical_url('/careers/job/549796263941','Morgan Stanley'),('https://morganstanley.eightfold.ai/careers/job/549796263941',True))
 def test_relative_vodafone_link(self):
  self.assertEqual(m.canonical_url('/careers/job/123','Vodafone Group'),('https://jobs.vodafone.com/careers/job/123',True))
 def test_unresolved_relative_not_guessed(self):self.assertIsNone(m.canonical_url('/jobs/1','Unknown')[0])
 def test_tracking_removed(self):self.assertEqual(m.canonical_url('https://jobs.example.com/job/1?utm_source=x&jobId=42#foo')[0],'https://jobs.example.com/job/1?jobId=42')
 def test_linkedin_id_canonicalised(self):self.assertEqual(m.canonical_url('https://uk.linkedin.com/jobs/view/example-title-4456195986?trk=x')[0],'https://www.linkedin.com/jobs/view/4456195986')
 def test_unsafe_links(self):
  for s in ['javascript:alert(1)','data:text/html,bad','https://user:pass@example.com','https://127.0.0.1/jobs','https://soylee22.github.io/careers/job/1']:
   self.assertIsNone(m.canonical_url(s)[0])
 def test_location_unknown_not_rest_uk(self):
  for s in ['2 Locations','3 locations','Location unspecified','Remote','Multiple locations','']:
   self.assertEqual(m.region(s),'unknown')
 def test_genuine_uk_locations(self):
  self.assertEqual(m.region('London, England, GBR'),'london');self.assertEqual(m.region('Manchester'),'rest');self.assertEqual(m.region('United Kingdom'),'uk')
 def test_foreign_city_names_not_uk(self):
  for s in ['London, Ontario, Canada','New York, USA','Birmingham, Alabama','Manchester, New Hampshire']:
   self.assertEqual(m.region(s),'international')
 def test_wrong_practice_overrides_nq_and_ip_keywords(self):self.assertEqual(m.classify('NQ Serious Injury Solicitor'),'other')
 def test_trade_mark_attorney_not_automatically_senior(self):
  j=m.make_job('Trade Mark Attorney / Solicitor 2-4 PQE','Example','London','https://example.com/job/1','firms',None)
  self.assertEqual(j['seniority'],'unspecified');self.assertEqual(j['pqe'],'2-4 PQE')
 def test_associate_not_automatically_nq(self):
  j=m.make_job('Associate Corporate Counsel','Example','London','https://example.com/job/1','inhouse',None)
  self.assertIsNone(j['pqe']);self.assertEqual(j['seniority'],'unspecified')
 def test_extraction_not_verification(self):
  j=m.make_job('Legal Counsel','Example','London','https://example.com/job/1','inhouse','2026-09-16',signal='PQE: 2-4 PQE')
  self.assertIsNone(j['descriptionCheckedAt']);self.assertEqual(j['pqeEvidence'],'Legacy extraction; unverified')
 def test_missing_role_not_assumed_closed(self):
  j=m.make_job('Counsel','Example','London','https://example.com/job/1','firms','2026-09-16',status='missing')
  self.assertEqual(j['status'],'missing');self.assertIsNone(j['sourceLastSeen'])
 def test_real_snapshot(self):
  data=json.loads((ROOT/'data/jobs.json').read_text());m.validate(data)
  self.assertTrue(all(('eightfold.ai' in j['url'] or 'jobs.vodafone.com' in j['url']) for j in data['jobs'] if j['linkRepaired']))
  self.assertTrue(all(j['descriptionCheckedAt'] is None for j in data['jobs']))
 def test_privacy_allowlist_rejects_unknown_fields(self):
  data=json.loads((ROOT/'data/jobs.json').read_text());data['jobs'][0]['notes']='PRIVATE'
  with self.assertRaises(ValueError):m.validate(data)
 def test_source_fields_cannot_smuggle_private_data(self):
  data=json.loads((ROOT/'data/jobs.json').read_text());data['sources'][0]['profile']='PRIVATE'
  with self.assertRaises(ValueError):m.validate(data)
 def test_rebuild_preserves_observation_dates(self):
  original=json.loads((ROOT/'data/jobs.json').read_text())
  with tempfile.TemporaryDirectory() as d:
   out=Path(d);(out/'data').mkdir();(out/'data/jobs.json').write_text(json.dumps(original));m.build(out)
   rebuilt=json.loads((out/'data/jobs.json').read_text());self.assertEqual(original,rebuilt)
 def test_empty_import_refuses_to_wipe_feed(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):m.import_legacy(Path(d))
 def test_retired_pages_are_small_redirects_not_private_reports(self):
  for name in [*m.ROUTES,'all','gone','shortlist']:
   s=(ROOT/(name+'.html')).read_text();self.assertLess(len(s),1000);self.assertNotIn('data-applied',s);self.assertIn('http-equiv="refresh"',s)
 def test_no_duplicate_identity(self):
  data=json.loads((ROOT/'data/jobs.json').read_text());self.assertEqual(len(data['jobs']),len({j['id'] for j in data['jobs']}))
 def test_role_present_and_missing_cannot_coexist(self):
  data=json.loads((ROOT/'data/jobs.json').read_text());live={j['url'] for j in data['jobs'] if j['status']=='listed' and j['url']};missing={j['url'] for j in data['jobs'] if j['status']=='missing' and j['url']};self.assertFalse(live&missing)
if __name__=='__main__':unittest.main()
