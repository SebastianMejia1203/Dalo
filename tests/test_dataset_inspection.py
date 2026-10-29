import json
import runpy
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "inspect_lsc54.py"


class DatasetInspectionTests(unittest.TestCase):
    def test_inventory_counts_extracted_videos_without_double_counting_zip_copies(self):
        inspect = runpy.run_path(str(SCRIPT))["video_inventory"]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            relative = "Courtesy/1/Cordialidad/Hola/0.avi"
            video = root / "RawVideos" / relative
            video.parent.mkdir(parents=True)
            video.write_bytes(b"example")
            self.assertEqual(inspect(root).get("Cordialidad/Hola", {}).get("videos", 0), 1)
            with zipfile.ZipFile(root / "RawVideos" / "courtesy.zip", "w") as archive:
                archive.writestr(relative, b"example")
            self.assertEqual(inspect(root)["Cordialidad/Hola"]["videos"], 1)

    def test_reads_first_sequence_without_consuming_the_rest_and_counts_videos(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "dataset"
            root.mkdir()
            (root / "RawVideos").mkdir()
            # A deliberately invalid tail proves the rest is not parsed.
            sequence = {
                "frame_10": {"r_hand": {"x": [0.5], "y": [1.1], "z": [0.0]}},
                "frame_2": {"r_hand": {"x": [0.4], "y": [0.6], "z": [0.0]},
                            "l_hand": {"x": [None], "y": [None], "z": [None]}},
            }
            prefix = '{"Signer_1":{"Cordialidad":{"Hola":{"vid_0":{"rep_0":'
            (root / "sample.json").write_text(
                prefix + json.dumps(sequence) + ',"unread":' + "x" * 100_000,
                encoding="utf-8",
            )
            with zipfile.ZipFile(root / "RawVideos" / "courtesy.zip", "w") as archive:
                archive.writestr("Courtesy/1/Cordialidad/Hola/0.avi", b"example")
                archive.writestr("Courtesy/2/Cordialidad/Hola/0.avi", b"example")
                archive.writestr("Courtesy/2/Cordialidad/Chao/0.avi", b"example")
            output = Path(temp) / "inspection"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--dataset", str(root), "--output", str(output)],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((output / "report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["sequence"]["path"],
                             ["Signer_1", "Cordialidad", "Hola", "vid_0", "rep_0"])
            self.assertEqual(report["sequence"]["frames"], 2)
            self.assertEqual(report["sequence"]["frame_keys"], ["frame_2", "frame_10"])
            self.assertEqual(report["sequence"]["xy_outside_unit_interval"], 1)
            self.assertEqual(report["sequence"]["missing_xy_values"], 2)
            self.assertEqual(report["inventory"]["Cordialidad/Hola"]["videos"], 2)
            self.assertEqual(report["inventory"]["Cordialidad/Hola"]["participants"], ["1", "2"])
            self.assertTrue((output / "viewer.html").is_file())

    def test_stops_at_read_limit_and_does_not_write_partial_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "dataset"
            root.mkdir()
            (root / "sample.json").write_text(
                '{"s":{"c":{"w":{"v":{"r":{"frame_0":[' + "0," * 5000,
                encoding="utf-8",
            )
            output = Path(temp) / "inspection"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--dataset", str(root), "--output", str(output),
                 "--max-mib", "0.001"],
                capture_output=True, text=True, encoding="utf-8",
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("limite", result.stderr.lower())
            self.assertFalse((output / "report.json").exists())


if __name__ == "__main__":
    unittest.main()
