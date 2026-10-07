import copy
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from release_acceptance import IPHONE_CHECKS, require_iphone_acceptance


class IPhoneAcceptance(unittest.TestCase):
    def report(self):
        return {'ios': {'status': 'passed', 'delivery': 'pwa', 'device': 'physical-iphone',
                        'checks': {key: {'status': 'passed', 'evidence': ['fixture-only']}
                                   for key in IPHONE_CHECKS}}}

    def test_complete_structure_accepted(self):
        require_iphone_acceptance(self.report())

    def test_owner_signing_and_desktop_emulation_rejected(self):
        for field, value in [('status', 'blocked-owner'), ('device', 'desktop-emulation'),
                             ('delivery', 'unsigned-ipa')]:
            report = self.report(); report['ios'][field] = value
            with self.assertRaises(SystemExit): require_iphone_acceptance(report)

    def test_every_required_check_and_reference_needed(self):
        for key in IPHONE_CHECKS:
            for row in [None, {'status': 'pending', 'evidence': ['fixture']},
                        {'status': 'passed', 'evidence': []},
                        {'status': 'passed', 'evidence': [' ']}]:
                report = copy.deepcopy(self.report()); report['ios']['checks'][key] = row
                with self.assertRaises(SystemExit): require_iphone_acceptance(report)

    def test_pwa_cannot_support_native_store_advertisement(self):
        with self.assertRaises(SystemExit):
            require_iphone_acceptance(self.report(), 'https://apps.apple.com/example')
        report = self.report(); report['ios']['delivery'] = 'native'
        require_iphone_acceptance(report, 'https://apps.apple.com/example')

    def test_missing_and_malformed_evidence_rejected(self):
        for report in [None, {}, {'ios': None}, {'ios': {'status': 'passed'}}]:
            with self.assertRaises(SystemExit): require_iphone_acceptance(report)


if __name__ == '__main__': unittest.main()
