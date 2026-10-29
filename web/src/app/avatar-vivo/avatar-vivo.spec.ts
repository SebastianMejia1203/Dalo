import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { Focus, LucideAngularModule, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-angular';

import { AvatarVivo } from './avatar-vivo';
import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { FotogramaAvatar } from '../avatar-lsc/avatar-lsc';
import { vi } from 'vitest';

describe('AvatarVivo', () => {
  let fixture: ComponentFixture<AvatarVivo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarVivo],
      providers: [
        importProvidersFrom(
          LucideAngularModule.pick({ Focus, RotateCcw, RotateCw, ZoomIn, ZoomOut }),
        ),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarVivo);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('muestra estado de carga sin modelo', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Cargando el avatar de cámara');
  });

  function prepararRig() {
    const avatar = fixture.componentInstance;
    avatar['three'] = THREE;
    avatar['escena'] = new THREE.Scene();
    avatar['camara'] = new THREE.PerspectiveCamera();
    avatar['renderer'] = {} as THREE.WebGLRenderer;
    vi.spyOn(avatar as unknown as { render(): void }, 'render').mockImplementation(() => undefined);
    const raiz = new THREE.Object3D();
    const nodos = new Map<VRMHumanBoneName, THREE.Object3D>();
    for (const nombre of ['head', 'neck', 'hips', 'spine', 'chest', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm'] as VRMHumanBoneName[]) {
      const nodo = new THREE.Bone();
      raiz.add(nodo);
      nodos.set(nombre, nodo);
      avatar['huesos'].set(nombre, nodo);
      avatar['descansos'].set(nombre, { direccion: new THREE.Vector3(0, 1, 0), local: new THREE.Quaternion() });
    }
    avatar['vrm'] = { update: () => undefined } as unknown as VRM;
    const f: FotogramaAvatar = { pose: Array.from({ length: 33 }, () => null), manoIzquierda: null, manoDerecha: null };
    f.pose[11] = [.7, .5, 0]; f.pose[12] = [.3, .5, 0];
    f.pose[23] = [.6, .9, 0]; f.pose[24] = [.4, .9, 0];
    f.pose[0] = [.5, .25, -.15];
    f.pose[2] = [.56, .2, -.1]; f.pose[5] = [.44, .2, -.1];
    f.pose[7] = [.6, .23, 0]; f.pose[8] = [.4, .23, 0];
    f.pose[9] = [.54, .3, -.1]; f.pose[10] = [.46, .3, -.1];
    return { avatar, nodos, f };
  }

  it('keeps the neutral head upright despite the nose being in front of the shoulders', () => {
    const { avatar, nodos, f } = prepararRig();
    avatar['actualizar'](f);
    expect(nodos.get('head')!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.01);
    expect(nodos.get('neck')!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.01);
  });

  it('uses camera proportions rather than stretching a square image to 16:9', () => {
    const { avatar, f } = prepararRig();
    fixture.componentRef.setInput('fotograma', { ...f, aspecto: 1 });
    const punto = avatar['aVector']([.75, .25, 0]);
    expect(punto.x).toBeCloseTo(punto.y);
  });

  it('follows a head tilt and allows recalibrating the neutral position', () => {
    const { avatar, nodos, f } = prepararRig();
    const cuello = nodos.get('neck')!;
    const cabeza = nodos.get('head')!;
    cuello.parent!.rotation.y = .7;
    cuello.add(cabeza);
    avatar['actualizar'](f);
    const rotacion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .25);
    for (const i of [2, 5, 7, 8, 9, 10]) {
      const p = avatar['aVector'](f.pose[i]! ).applyQuaternion(rotacion);
      f.pose[i] = [p.x / (2 * 4 / 3) + .5, .5 - p.y / 2, -p.z / (2 * 4 / 3)];
    }
    for (let i = 0; i < 25; i++) avatar['actualizar'](f);
    const mundo = cabeza.getWorldQuaternion(new THREE.Quaternion());
    const esperado = rotacion.clone().multiply(cuello.getWorldQuaternion(new THREE.Quaternion()));
    expect(mundo.angleTo(esperado)).toBeLessThan(.02);
    avatar['calibrarCabeza']();
    for (let i = 0; i < 25; i++) avatar['actualizar'](f);
    expect(nodos.get('head')!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.02);
  });

  it('keeps the torso at rest even when the estimated hip depth changes', () => {
    const { avatar, nodos, f } = prepararRig();
    f.pose[23] = [.6, .9, .7]; f.pose[24] = [.4, .9, .7];
    avatar['actualizar'](f);
    expect(nodos.get('hips')!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.01);
    expect(nodos.get('spine')!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.01);
  });

  it('lowers the arms instead of returning to a T pose when elbows disappear', () => {
    const { avatar, nodos, f } = prepararRig();
    for (let i = 0; i < 40; i++) avatar['actualizar'](f);
    const direccion = new THREE.Vector3(0, 1, 0).applyQuaternion(nodos.get('leftUpperArm')!.quaternion);
    expect(direccion.y).toBeLessThan(-.8);
  });

  it('bridges a brief missing wrist only in the avatar and releases it after 150 ms', () => {
    const { avatar, f } = prepararRig();
    const reloj = vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      const datos: FotogramaAvatar = { ...f, manoIzquierda: Array.from({ length: 21 }, () => [.6, .4, 0]) };
      const inicial = avatar['puntosDe'](datos, 'izquierda');
      reloj.mockReturnValue(1080);
      const perdido: FotogramaAvatar = { ...f, manoIzquierda: null };
      expect(avatar['puntosDe'](perdido, 'izquierda')[0]).toEqual(inicial[0]);
      expect(perdido.manoIzquierda).toBeNull();
      reloj.mockReturnValue(1200);
      expect(avatar['puntosDe'](perdido, 'izquierda').some((p) => p !== null)).toBe(false);
    } finally { reloj.mockRestore(); }
  });

  it('keeps both palms untwisted when landmarks match the rig rest pose', () => {
    const { avatar } = prepararRig();
    const nodos = new Map<VRMHumanBoneName, THREE.Object3D>();
    const raiz = new THREE.Object3D();
    for (const [lado, signo] of [['left', 1], ['right', -1]] as const) {
      const mano = new THREE.Bone(); raiz.add(mano); nodos.set(`${lado}Hand`, mano);
      for (const [nombre, x, y] of [['IndexProximal', .25, 1], ['MiddleProximal', 0, 1], ['RingProximal', -.1, 1], ['LittleProximal', -.25, 1], ['ThumbProximal', .4, .4]] as const) {
        const dedo = new THREE.Bone(); dedo.position.set(x * signo, y, 0); mano.add(dedo);
        nodos.set(`${lado}${nombre}` as VRMHumanBoneName, dedo);
      }
      avatar['huesos'].set(`${lado}Hand`, mano);
      avatar['descansos'].set(`${lado}Hand`, { direccion: new THREE.Vector3(0, 1, 0), local: new THREE.Quaternion() });
    }
    raiz.rotation.set(.2, .5, -.3);
    raiz.updateMatrixWorld(true);
    const vrm = { humanoid: { getNormalizedBoneNode: (n: VRMHumanBoneName) => nodos.get(n) ?? null } } as unknown as VRM;
    avatar['calibrarEjePalma'](vrm);
    for (const [lado, signo] of [['left', 1], ['right', -1]] as const) {
      const puntos = Array.from({ length: 21 }, () => new THREE.Vector3());
      puntos[5].set(.25 * signo, 1, 0); puntos[9].set(0, 1, 0);
      puntos[13].set(-.1 * signo, 1, 0); puntos[17].set(-.25 * signo, 1, 0);
      puntos.forEach((p) => p.applyMatrix4(raiz.matrixWorld));
      avatar['apuntarMano'](lado, puntos);
      expect(nodos.get(`${lado}Hand`)!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.15);

      // Gira la nube de puntos con respecto al padre, como una muñeca real.
      const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .6);
      puntos.forEach((p) => p.applyQuaternion(giro));
      avatar['apuntarMano'](lado, puntos);
      const q = nodos.get(`${lado}Hand`)!.getWorldQuaternion(new THREE.Quaternion());
      const normalActual = avatar['uLocalPalma']![lado].clone().applyQuaternion(q);
      const normalEsperada = puntos[5].clone().sub(puntos[0]).cross(puntos[17].clone().sub(puntos[0])).normalize();
      expect(normalActual.dot(normalEsperada)).toBeGreaterThan(.999);
    }
  });
});
