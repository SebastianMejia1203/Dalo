"""Check shoulder roll as well as elbow and wrist torsion, inside Blender."""
import runpy
from pathlib import Path

result = runpy.run_path(str(Path(__file__).with_name('check_bienvenido_elbows.py')))
assert result['maximum']['UpperArm'] < 50, 'Upper arm roll still carries the sleeve upward'
print('BIENVENIDO_SHOULDER_CHECK_PASS')
