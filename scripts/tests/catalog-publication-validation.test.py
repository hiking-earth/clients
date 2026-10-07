import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / 'catalog_publication_validation.py'
spec = importlib.util.spec_from_file_location('catalog_publication_validation', MODULE_PATH)
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


class RouteCatalogValidationTests(unittest.TestCase):
    def route(self, source='osm'):
        prefixes = {'osm': 'osm-relation-1', 'usfs': 'usfs-1', 'hk': 'hk-afcd-1'}
        source_urls = {
            'osm': 'https://www.openstreetmap.org/copyright',
            'usfs': 'https://apps.fs.usda.gov/arcx/service',
            'hk': 'https://portal.csdi.gov.hk/server/rest/service',
        }
        row = {
            'id': prefixes[source], 'name': 'Trail', 'region': 'Region',
            'center': [114.1, 22.3], 'sourceUrl': source_urls[source],
            'fetchedAt': '2026-10-07T00:00:00Z', 'status': '待核验',
        }
        if source == 'hk':
            row['referencePaths'] = [[[114.0, 22.0], [114.1, 22.1]]]
        return {'schemaVersion': 1, 'sourceUrl': source_urls[source], 'routes': [row]}

    def test_accepts_each_discovery_source_without_granting_access(self):
        for source in ('osm', 'usfs', 'hk'):
            with self.subTest(source=source):
                self.assertEqual(validation.validate_route_catalog(source, self.route(source)), 1)

    def test_rejects_duplicate_ids(self):
        data = self.route()
        data['routes'].append(dict(data['routes'][0]))
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            validation.validate_route_catalog('osm', data)

    def test_rejects_non_pending_discovery_status(self):
        data = self.route()
        data['routes'][0]['status'] = '开放中'
        with self.assertRaisesRegex(ValueError, 'cannot publish status'):
            validation.validate_route_catalog('osm', data)

    def test_rejects_bad_coordinate_and_cross_source_host(self):
        data = self.route()
        data['routes'][0]['center'] = [181, 22]
        with self.assertRaisesRegex(ValueError, 'WGS84'):
            validation.validate_route_catalog('osm', data)
        data = self.route()
        data['routes'][0]['sourceUrl'] = 'https://example.org/trail'
        with self.assertRaisesRegex(ValueError, 'provenance'):
            validation.validate_route_catalog('osm', data)

    def test_rejects_hong_kong_reference_line_with_bad_points(self):
        data = self.route('hk')
        data['routes'][0]['referencePaths'] = [[[114.0, 22.0]]]
        with self.assertRaisesRegex(ValueError, 'at least two points'):
            validation.validate_route_catalog('hk', data)


class NewsCatalogValidationTests(unittest.TestCase):
    def catalog(self):
        source = {
            'id': 'official', 'url': 'https://feed.example.gov/rss',
            'articleHosts': ['news.example.gov'],
        }
        return {
            'schemaVersion': 1, 'sources': [source],
            'items': [{
                'id': 'item-1', 'title': 'Notice', 'region': 'Region',
                'sourceId': 'official', 'sourceLabel': 'Official source',
                'verified': True, 'url': 'https://news.example.gov/notice/1',
                'sourceUrl': source['url'], 'publishedAt': '2026-10-06T10:00:00Z',
                'fetchedAt': '2026-10-07T00:00:00Z',
            }],
        }

    def test_accepts_allowlisted_verified_metadata_link(self):
        self.assertEqual(validation.validate_news_catalog(self.catalog()), 1)

    def test_rejects_article_host_outside_source_allowlist(self):
        data = self.catalog()
        data['items'][0]['url'] = 'https://unrelated.example/notice/1'
        with self.assertRaisesRegex(ValueError, 'not allowed'):
            validation.validate_news_catalog(data)

    def test_rejects_unverified_link_and_unknown_source(self):
        data = self.catalog()
        data['items'][0]['verified'] = False
        with self.assertRaisesRegex(ValueError, 'verified'):
            validation.validate_news_catalog(data)
        data = self.catalog()
        data['items'][0]['sourceId'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'unknown source'):
            validation.validate_news_catalog(data)

    def test_rejects_source_pending_feed_acceptance(self):
        data = self.catalog()
        data['sources'][0]['feedAcceptance'] = 'pending-unified-verification'
        with self.assertRaisesRegex(ValueError, 'has not been accepted'):
            validation.validate_news_catalog(data)


if __name__ == '__main__':
    unittest.main()
