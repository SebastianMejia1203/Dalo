import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sign_inventory', Path(__file__).with_name('inventory.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InventoryTests(unittest.TestCase):
    def test_participant_split_and_duplicate_exclusion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for person in range(1, 5):
                folder = root/str(person)/'Cordialidad'/'Hola'
                folder.mkdir(parents=True)
                (folder/'0.avi').write_bytes(f'video-{person}'.encode())
            (root/'2/Cordialidad/Hola/1.avi').write_bytes(b'video-1')
            a = module.inventory(root, module.parse_words(['hola=Cordialidad/Hola']))
            b = module.inventory(root, module.parse_words(['hola=Cordialidad/Hola']))
            self.assertEqual(a['holdoutParticipants'], b['holdoutParticipants'])
            self.assertEqual(a['classes']['hola']['uniqueVideos'], 4)
            self.assertEqual(a['classes']['hola']['videos'], 5)
            self.assertFalse(set(a['developmentParticipants']) & set(a['holdoutParticipants']))
            partitions = {}
            for row in a['samples']:
                if row['duplicateOf']:
                    self.assertEqual(row['partition'], 'excluded_duplicate')
                else:
                    partitions.setdefault(row['participant'], set()).add(row['partition'])
            self.assertTrue(all(len(values) == 1 for values in partitions.values()))

    def test_conflicting_labels_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for word in ['Hola', 'Chao']:
                folder = root/'1'/'Cordialidad'/word
                folder.mkdir(parents=True)
                (folder/'0.avi').write_bytes(b'identical-video')
            with self.assertRaisesRegex(ValueError, 'contradictorias'):
                module.inventory(root, module.parse_words(['hola=Cordialidad/Hola', 'chao=Cordialidad/Chao']))

    def test_missing_class_and_invalid_mapping_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'No hay videos'):
                module.inventory(directory, module.parse_words(['hola=Cordialidad/Hola']))
        for mapping in ['otra=Cordialidad/Hola', 'hola=../Hola', 'Hola=Cordialidad/Hola']:
            with self.assertRaises(ValueError):
                module.parse_words([mapping])


if __name__ == '__main__':
    unittest.main()
