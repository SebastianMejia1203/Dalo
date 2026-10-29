import { ModeloAvatarService } from './modelo-avatar';

describe('ModeloAvatarService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('comparte una única descarga entre precargar y obtenerModelo', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal('fetch', fetchFalso);
    servicio.precargar();
    // Los 8 bytes no son un VRM válido: la carga falla, pero debe haberse
    // intentado una sola vez aunque se pida por dos caminos.
    await expect(servicio.obtenerModelo()).rejects.toThrow();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('obtenerAnimacion descarga una sola vez y propaga el error de red', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(async () => {
      throw new Error('sin red');
    });
    vi.stubGlobal('fetch', fetchFalso);
    // URL absoluta: en jsdom new Request() exige base para las relativas.
    await expect(servicio.obtenerAnimacion('http://localhost/avatar/x.vrma')).rejects.toThrow(
      'sin red',
    );
    await expect(servicio.obtenerAnimacion('http://localhost/avatar/x.vrma')).rejects.toThrow(
      'sin red',
    );
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    const urls = fetchFalso.mock.calls.map((args: unknown[]) => {
      const primero = args[0] as { url?: unknown } | string;
      return typeof primero === 'string' ? primero : String(primero?.url ?? primero);
    });
    expect(urls.every((url) => url.includes('x.vrma'))).toBe(true);
  });

  it('reintenta la descarga si la precarga falló', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(
      async (): Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }> => {
        throw new Error('sin red');
      },
    );
    fetchFalso
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      });
    vi.stubGlobal('fetch', fetchFalso);
    servicio.precargar();
    await expect(servicio.obtenerModelo()).rejects.toThrow();
    await expect(servicio.obtenerModelo()).rejects.toThrow('404');
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('obtenerSecuencia descarga una sola vez por URL', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: 1 }),
    }));
    vi.stubGlobal('fetch', fetchFalso);
    await expect(servicio.obtenerSecuencia('avatar/a.json')).resolves.toEqual({ version: 1 });
    await expect(servicio.obtenerSecuencia('avatar/a.json')).resolves.toEqual({ version: 1 });
    await expect(servicio.obtenerSecuencia('avatar/b.json')).resolves.toEqual({ version: 1 });
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('obtenerSecuencia reintenta si la descarga falló', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(async () => {
      throw new Error('sin red');
    });
    vi.stubGlobal('fetch', fetchFalso);
    await expect(servicio.obtenerSecuencia('avatar/a.json')).rejects.toThrow('sin red');
    await expect(servicio.obtenerSecuencia('avatar/a.json')).rejects.toThrow('sin red');
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('precargarCatalogo no repite los JSON aunque se llame dos veces', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(async (url: string) => {
      if (url.endsWith('.json')) {
        return { ok: true, json: async () => ({ version: 1 }) };
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal('fetch', fetchFalso);
    const entradas = [
      { animacionUrl: null, avatarUrl: 'avatar/a.json' },
      { animacionUrl: null, avatarUrl: 'avatar/b.json' },
    ];
    servicio.precargarCatalogo(entradas);
    servicio.precargarCatalogo(entradas);
    // Espera a que los JSON queden en caché (el VRM falla: bytes inválidos).
    await vi.waitFor(() => {
      expect(
        fetchFalso.mock.calls.filter((args) => String(args[0]).endsWith('.json')),
      ).toHaveLength(2);
    });
    await Promise.resolve();
    const jsons = fetchFalso.mock.calls.filter((args) => String(args[0]).endsWith('.json'));
    expect(jsons).toHaveLength(2);
  });

  it('retiene las descargas hasta después del primer pintado', async () => {
    const servicio = new ModeloAvatarService();
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: 1 }),
    }));
    vi.stubGlobal('fetch', fetchFalso);
    servicio.retenerCargaTrasPintado();
    // La puerta se abre sola tras el pintado: resuelve con una sola descarga.
    await expect(servicio.obtenerSecuencia('avatar/a.json')).resolves.toEqual({ version: 1 });
    await expect(servicio.obtenerSecuencia('avatar/a.json')).resolves.toEqual({ version: 1 });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
