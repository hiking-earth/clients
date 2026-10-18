import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from official_feed_xml import parse_rss


class OfficialFeedXml(unittest.TestCase):
    def test_accepts_basic_rss(self):
        root = parse_rss(b'<rss version="2.0"><channel><item><title>Trail notice</title></item></channel></rss>')
        self.assertEqual(root.findtext('./channel/item/title'), 'Trail notice')

    def test_rejects_doctype_independent_of_xml_encoding(self):
        for encoding in ('utf-8', 'utf-16'):
            document = f'<?xml version="1.0" encoding="{encoding}"?><!DOCTYPE rss [<!ENTITY x "expanded">]><rss><channel><item><title>&x;</title></item></channel></rss>'
            payload = document.encode(encoding)
            with self.subTest(encoding=payload[:4]):
                with self.assertRaisesRegex(ValueError, 'doctype'):
                    parse_rss(payload)


if __name__ == '__main__':
    unittest.main()
