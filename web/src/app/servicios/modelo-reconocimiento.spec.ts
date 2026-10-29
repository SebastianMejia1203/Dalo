import { TestBed } from '@angular/core/testing';
import { ModeloReconocimientoService, MetadatosModelo } from './modelo-reconocimiento';
import { SecuenciaMundo } from '../reconocimiento/caracteristicas-lsc';
import fixture from '../reconocimiento/paridad-fixture.json';

const METADATOS: MetadatosModelo = {
  clases: ['chao', 'perfecto', 'otra'],
  fotogramas: 48,
  caracteristicas: fixture.nombres as string[],
  media: Array.from({ length: 151 }, () => 0),
  desviacion: Array.from({ length: 151 }, () => 1),
  version_caracteristicas: 2,
};

type PuntoJson = [number, number, number] | null;

function secuenciaDesdeFixture(): SecuenciaMundo {
  const convertir = (grupo: unknown): ([number, number, number] | null)[][] => {
    const filas = grupo as unknown as (PuntoJson[] | null)[];
    return filas.map((fila) => (fila ?? []).map((p) => (p === null ? null : ([p[0], p[1], p[2]] as [number, number, number]))));
  };
  return {
    poseMundo: convertir(fixture.entrada.pose_mundo),
    manoIzquierdaMundo: convertir(fixture.entrada.mano_izquierda_mundo),
    manoDerechaMundo: convertir(fixture.entrada.mano_derecha_mundo),
  };
}

describe('ModeloReconocimientoService', () => {
  let servicio: ModeloReconocimientoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(ModeloReconocimientoService);
  });

  it('clasifica una secuencia real y devuelve probabilidades que suman 1', async () => {
    servicio.establecerSesionParaPruebas(
      { run: async () => ({ logitos: { data: new Float32Array([3, 1, 0]) } }) },
      METADATOS,
    );
    const prediccion = await servicio.clasificar(secuenciaDesdeFixture());
    expect(prediccion?.clase).toBe('chao');
    expect(prediccion?.probabilidad).toBeGreaterThan(0.7);
    const suma = Object.values(prediccion?.probabilidades ?? {}).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 5);
    expect(servicio.listas).toBe(true);
  });

  it('devuelve null cuando la secuencia es demasiado corta', async () => {
    servicio.establecerSesionParaPruebas(
      { run: async () => ({ logitos: { data: new Float32Array([0, 0, 0]) } }) },
      METADATOS,
    );
    const prediccion = await servicio.clasificar({ poseMundo: [], manoIzquierdaMundo: [], manoDerechaMundo: [] });
    expect(prediccion).toBeNull();
  });

  it('pasa al modelo un tensor 1x48x151 normalizado', async () => {
    let forma: number[] = [];
    servicio.establecerSesionParaPruebas(
      {
        run: async (feeds) => {
          forma = feeds['secuencia'].dims;
          return { logitos: { data: new Float32Array([0, 2, 0]) } };
        },
      },
      METADATOS,
    );
    const prediccion = await servicio.clasificar(secuenciaDesdeFixture());
    expect(forma).toEqual([1, 48, 151]);
    expect(prediccion?.clase).toBe('perfecto');
  });
});
