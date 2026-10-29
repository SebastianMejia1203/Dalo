"""Reference-guided palm and finger targets for the initial Cordialidad batch.

Blender coordinates: X anatomical left, -Y forward, Z up. Wrist trajectories
come from LSC-54; these targets replace unreliable depth/finger orientations.
The resulting clips remain candidates for per-sign review, not validated LSC.
"""
import math
from mathutils import Vector

RIGHT_ONLY = {'bano', 'bien', 'congusto', 'excelente', 'mal', 'masomenos',
              'necesitar', 'no', 'porfavor', 'si'}


def targets(sign, side, t):
    mirror = -1 if side == 'R' else 1
    forward = Vector((0, -.1, 1))
    normal = Vector((0, -1, 0))
    shape = 'flat'
    thumb = 'close'
    depth = -.23
    if sign in {'bien', 'muybien', 'mal', 'muymal', 'si'}:
        forward = Vector((0, -.85, .5))
        shape = 'fist'
        thumb = 'up' if sign in {'bien', 'muybien'} else 'down' if sign in {'mal', 'muymal'} else 'fold'
    elif sign == 'bano':
        # Mano de "stop": dedos juntos, palma al frente, giro axial suave
        # (~2 ciclos) sobre el propio eje de la muneca, sin oleaje lateral.
        ang = math.radians(28) * math.sin(t * 4 * math.pi)
        forward = Vector((0, -.1, 1)).normalized()
        n0 = Vector((1, 0, 0))
        normal = (n0 * math.cos(ang) + forward.cross(n0) * math.sin(ang)).normalized()
        thumb = 'fold'
    elif sign == 'masomenos':
        # Mano abierta a la altura del pecho con giro axial (pronacion /
        # supinacion) ~2,5 ciclos sobre el propio eje de la muneca: la normal
        # rota alrededor de `forward` (que queda casi fijo) en vez de
        # oscilar de izquierda a derecha como saludando. Asi no se confunde
        # con Hola (subida lateral sin oleaje) ni con Chao (oleaje lateral
        # con la palma al frente y los dedos arriba).
        ang = math.radians(50) * math.sin(t * 5 * math.pi)
        forward = Vector((0, -.12, 1)).normalized()
        n0 = Vector((1, 0, 0))
        normal = (n0 * math.cos(ang) + forward.cross(n0) * math.sin(ang)).normalized()
        shape, thumb = 'spread', 'open'
    elif sign == 'necesitar':
        shape, thumb = 'index', 'fold'
        forward = Vector((.08 * math.sin(t * 4 * math.pi), -.1, 1))
    elif sign == 'no':
        shape, thumb = 'no', 'open'
    elif sign == 'excelente':
        shape, thumb = 'pinch', 'pinch'
    elif sign == 'denada':
        shape, thumb = ('two', 'open') if side == 'R' else ('spread', 'open')
        forward = Vector((.3, -.12, 1)) if side == 'R' else Vector((0, -.1, 1))
    elif sign == 'comoesta':
        # Open hands initially face the speaker, then rotate palms up.
        u = max(0, min(1, (t - .30) / .35))
        forward = Vector((mirror * .15, -.85 * u, 1 - .65 * u))
        normal = Vector((0, 1 - u, u))
        shape, thumb = 'spread', 'open'
    elif sign in {'congusto', 'muchasgracias'}:
        forward = Vector((0, -.85, .52))
        normal = Vector((0, .52, .85))
        shape, thumb = 'flat', 'close'
    elif sign in {'buenosdias', 'buenastardes', 'buenasnoches'}:
        if t < .42:
            forward = Vector((0, -.75, .65)) if side == 'L' else Vector((.4, .1, .9))
            normal = Vector((0, .65, .75)) if side == 'L' else Vector((0, 1, -.1))
        elif sign == 'buenosdias':
            shape, thumb = 'spread', 'open'
        elif sign == 'buenasnoches':
            shape, thumb = 'fist', 'fold'
            forward, normal = Vector((-mirror, -.2, 0)), Vector((0, -1, 0))
        else:
            shape, thumb = 'flat', 'close'
            forward = Vector((-mirror, -.2, .15))
            normal = Vector((0, -1, 0)) if side == 'R' else Vector((0, 0, 1))
    elif sign == 'invitar':
        forward = Vector((-mirror * .9, -.4, .1))
        normal = Vector((0, 0, 1)) if side == 'R' else Vector((0, 0, -1))
    elif sign == 'permiso':
        forward = Vector((0, -.1, 1)) if side == 'R' else Vector((-.9, -.3, 0))
        normal = Vector((0, -1, 0)) if side == 'R' else Vector((0, 0, -1))
    elif sign == 'porfavor':
        forward, normal = Vector((.95, .0, .3)), Vector((0, 1, 0))
        shape, thumb, depth = 'fist', 'fold', -.155
    elif sign == 'presentar':
        forward = Vector((-mirror * .85, -.4, .1))
        normal = Vector((0, -1, 0))
    elif sign == 'sentarse':
        shape, thumb = 'two', 'fold'
        forward = Vector((-mirror * .9, -.3, -.15))
        normal = Vector((0, 0, -1))
    elif sign == 'tranquilo':
        forward = Vector((0, -.2, 1)) if side == 'R' else Vector((-.9, -.4, 0))
        normal = Vector((0, -1, 0)) if side == 'R' else Vector((0, 0, 1))
    return forward.normalized(), normal.normalized(), shape, thumb, depth


def finger_angles(shape, digit, t):
    """Local joint flexion in degrees; transported nail normals avoid roll flips."""
    closed = (42, 82, 45)
    if shape == 'fist':
        return closed
    if shape in {'index', 'two', 'no'}:
        extended = digit == 'Index' or (shape in {'two', 'no'} and digit == 'Middle')
        if not extended:
            return closed
        if shape == 'no':
            closure = .5 + .5 * math.sin(t * 6 * math.pi)
            return (closure * 48, closure * 58, closure * 25)
        if shape == 'index':
            return (8 + 10 * math.sin(t * 4 * math.pi), 7, 4)
        return (5, 5, 3)
    if shape == 'pinch':
        return (38, 58, 38)
    return (4, 3, 2)
