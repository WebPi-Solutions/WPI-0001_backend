import { MAP_RESPONSE_KEY, MapResponse } from './map-response.decorator';

/**
 * DTO ficticio usado solo para comprobar que el decorador guarda la clase en metadata.
 */
class SomeDto {
  public name: string;
}

/**
 * Controlador ficticio para aplicar `@MapResponse` sobre un método.
 */
class DummyController {
  @MapResponse(SomeDto)
  handler(): SomeDto {
    return { name: 'test' };
  }
}

/**
 * Pruebas del decorador `MapResponse` y de su clave de metadata.
 */
describe('MapResponse', () => {
  it('MAP_RESPONSE_KEY debe ser map_response_dto', () => {
    expect(MAP_RESPONSE_KEY).toBe('map_response_dto');
  });

  it('MapResponse debe devolver una función decoradora', () => {
    expect(typeof MapResponse(SomeDto)).toBe('function');
  });

  it('debe guardar la clase DTO en la metadata del método', () => {
    const storedDto = Reflect.getMetadata(MAP_RESPONSE_KEY, DummyController.prototype.handler);
    expect(storedDto).toBe(SomeDto);
  });
});
