import hashlib, importlib.util, json, pathlib, tempfile, unittest
spec=importlib.util.spec_from_file_location('inventory',pathlib.Path(__file__).parents[1]/'export-offline-map-inventory.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name)
        self.state={'schemaVersion':1,'build':'20261006.pmtiles','regions':{'example':'complete'}}
        self.record={'id':'example','file':'example-20261006.pmtiles','upstream':{'build':'20261006.pmtiles'},'bytes':127,'sha256':hashlib.sha256(b'x'*127).hexdigest(),'license':'ODbL-1.0 Produced Work','attribution':'OSM contributors','sourcePolicy':'https://docs.protomaps.com/basemaps/downloads'}
        (self.root/self.record['file']).write_bytes(b'x'*127);self.write()
    def write(self):
        (self.root/'batch.json').write_text(json.dumps(self.state));(self.root/'example-20261006.json').write_text(json.dumps(self.record))
    def test_complete_bytes(self):
        value=module.export(self.root);self.assertEqual(value['bytes'],127);self.assertFalse(value['accessVerified'])
    def test_partial_batch(self):
        self.state['regions']['example']='failed';self.write()
        with self.assertRaises(ValueError):module.export(self.root)
    def test_changed_bytes(self):
        (self.root/self.record['file']).write_bytes(b'y'*127)
        with self.assertRaises(ValueError):module.export(self.root)
    def test_missing_rights(self):
        del self.record['attribution'];self.write()
        with self.assertRaises(ValueError):module.export(self.root)
    def test_invalid_upstream(self):
        self.record['upstream']=[];self.write()
        with self.assertRaises(ValueError):module.export(self.root)

if __name__=='__main__':unittest.main()
