import { findById, matchSpanishText } from './adapters';

describe('Cordialidad completa en Español a Señas', () => {
  it.each([
    ['Baño', 'bano'],
    ['Bien', 'bien'],
    ['Buenas noches', 'buenasnoches'],
    ['Buenas tardes', 'buenastardes'],
    ['Buenos días', 'buenosdias'],
    ['Cómo está', 'comoesta'],
    ['Con gusto', 'congusto'],
    ['De nada', 'denada'],
    ['Excelente', 'excelente'],
    ['Invitar', 'invitar'],
    ['Mal', 'mal'],
    ['Más o menos', 'masomenos'],
    ['Muchas gracias', 'muchasgracias'],
    ['Muy bien', 'muybien'],
    ['Muy mal', 'muymal'],
    ['Necesitar', 'necesitar'],
    ['No', 'no'],
    ['Permiso', 'permiso'],
    ['Por favor', 'porfavor'],
    ['Presentar', 'presentar'],
    ['Sentarse', 'sentarse'],
    ['Sí', 'si'],
    ['Tranquilo', 'tranquilo'],
  ])('busca %s y ofrece su propia animación', (texto, id) => {
    expect(matchSpanishText(texto)).toEqual({ kind: 'directa', id, via: 'exacta' });
    const entrada = findById(id);
    expect(entrada?.animacionUrl).toBe(`avatar/${id}.vrma`);
    expect(entrada?.reconocible).toBe(false);
  });

  it('no interpreta sí o no dentro de otras palabras', () => {
    expect(matchSpanishText('el ornitorrinco nada al amanecer')).toEqual({ kind: 'fuera' });
    expect(matchSpanishText('cocinar')).toEqual({ kind: 'fuera' });
  });
});
