import { describe, expect, it } from 'vitest';
import { resolverRutaWasm } from './modelo-reconocimiento';

describe('resolverRutaWasm', () => {
  it('devuelve una URL absoluta hacia la carpeta ort/', () => {
    expect(resolverRutaWasm('http://localhost:4200/')).toBe('http://localhost:4200/ort/');
  });

  it('respeta una base con subruta', () => {
    expect(resolverRutaWasm('https://ejemplo.com/dalo/')).toBe('https://ejemplo.com/dalo/ort/');
  });
});
