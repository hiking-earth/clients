import datetime as dt
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from official_content_policy import apply_metadata_policy

class MetadataPolicy(unittest.TestCase):
    now = dt.datetime(2026, 10, 7, tzinfo=dt.timezone.utc)
    sources = [{'id': 's', 'reuse': 'metadata-links-only', 'url': 'https://official.example/rss',
                'articleHosts': ['official.example']}]
    def row(self, **patch):
        return {'id':'a','sourceId':'s','verified':True,'sourceUrl':self.sources[0]['url'],
                'url':'https://official.example/a','title':'Notice','region':'Region','sourceLabel':'Official',
                'publishedAt':self.now.isoformat(),'fetchedAt':self.now.isoformat(),**patch}
    def test_traceable_fresh_metadata(self):
        rows, rejected = apply_metadata_policy([self.row()], self.sources, self.now)
        self.assertEqual(len(rows), 1); self.assertEqual(rejected, [])
    def test_withhold_and_preserve_original(self):
        cases = [({'fetchedAt':(self.now-dt.timedelta(days=91)).isoformat()},'metadata-freshness-expired'),
                 ({'url':'https://other.example/a'},'article-host-mismatch'),
                 ({'imageUrl':'https://official.example/image'},'unsupported-content-rights'),
                 ({'sourceId':'removed'},'source-not-approved'),
                 ({'fetchedAt':(self.now+dt.timedelta(days=1)).isoformat()},'future-freshness-date'),
                 ({'sourceUrl':'https://other.example/rss'},'provenance-mismatch')]
        for patch, reason in cases:
            original=self.row(**patch)
            rows, rejected=apply_metadata_policy([original],self.sources,self.now)
            self.assertFalse(rows); self.assertEqual(rejected[0]['reason'],reason)
            self.assertEqual(rejected[0]['record'],original)
    def test_withhold_items_from_feed_pending_unified_verification(self):
        sources = [{**self.sources[0], 'feedAcceptance':'pending-unified-verification'}]
        original = self.row()
        rows, rejected = apply_metadata_policy([original], sources, self.now)
        self.assertFalse(rows)
        self.assertEqual(rejected[0]['reason'], 'source-feed-not-accepted')
        self.assertEqual(rejected[0]['record'], original)
    def test_feed_acceptance_requires_current_verification_date(self):
        cases = [({}, 'source-feed-verification-invalid'),
                 ({'feedVerifiedAt':'2026-10-08'}, 'source-feed-verification-future'),
                 ({'feedVerifiedAt':'2026-07-08'}, 'source-feed-verification-expired')]
        for patch, reason in cases:
            source = {**self.sources[0], 'feedAcceptance':'accepted', **patch}
            rows, rejected = apply_metadata_policy([self.row()], [source], self.now)
            self.assertFalse(rows)
            self.assertEqual(rejected[0]['reason'], reason)
        source = {**self.sources[0], 'feedAcceptance':'accepted', 'feedVerifiedAt':'2026-07-09'}
        rows, rejected = apply_metadata_policy([self.row()], [source], self.now)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rejected, [])
    def test_invalid_source_and_date(self):
        for row in [None, self.row(sourceId=[]), self.row(fetchedAt='bad'), self.row(fetchedAt='2026-10-07T00:00:00'),
                    self.row(publishedAt='bad'), self.row(publishedAt='2026-10-07T00:00:00')]:
            rows,rejected=apply_metadata_policy([row],self.sources,self.now)
            self.assertFalse(rows); self.assertEqual(len(rejected),1)
    def test_expiry_boundary_and_unapproved_body(self):
        rows,_=apply_metadata_policy([self.row(fetchedAt=(self.now-dt.timedelta(days=90)).isoformat())],self.sources,self.now)
        self.assertEqual(len(rows),1)
        rows,rejected=apply_metadata_policy([self.row(body='article text')],self.sources,self.now)
        self.assertFalse(rows); self.assertEqual(rejected[0]['reason'],'unsupported-content-rights')
    def test_withhold_missing_attribution_future_publication_and_invalid_center(self):
        for patch, reason in [({'region':' '},'missing-attribution'),
                              ({'publishedAt':(self.now+dt.timedelta(days=1)).isoformat()},'future-publication-date'),
                              ({'center':[181,0]},'invalid-center')]:
            rows,rejected=apply_metadata_policy([self.row(**patch)],self.sources,self.now)
            self.assertFalse(rows); self.assertEqual(rejected[0]['reason'],reason)
if __name__ == '__main__': unittest.main()
