import { AppService } from './app.service';

/**
 * Pruebas unitarias de `AppService`.
 */
describe('AppService', () => {
  it('debe estar definido', () => {
    expect(new AppService()).toBeDefined();
  });

  it('getHello debe devolver Hello World!', () => {
    const appService = new AppService();
    expect(appService.getHello()).toBe('Hello World!');
  });
});
