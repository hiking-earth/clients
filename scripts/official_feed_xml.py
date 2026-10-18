"""Parse the small, metadata-only RSS subset accepted by the collector."""
import xml.etree.ElementTree as ET


class _RejectDoctypeBuilder(ET.TreeBuilder):
    """Reject DTDs at the parser level, independent of XML byte encoding."""

    def doctype(self, name, pubid, system):
        raise ValueError('unsupported XML doctype declarations')


def parse_rss(data):
    """Parse RSS without permitting DTD/entity declarations."""
    parser = ET.XMLParser(target=_RejectDoctypeBuilder())
    root = ET.fromstring(data, parser=parser)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('unsupported RSS structure')
    return root
