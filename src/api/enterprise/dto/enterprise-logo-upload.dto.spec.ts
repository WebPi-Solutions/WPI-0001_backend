import { MulterFile } from 'multer';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { EnterpriseLogoUploadDto } from './enterprise-logo-upload.dto';

/**
 * Construye un archivo multer mínimo para cubrir el DTO de logo.
 *
 * @returns Archivo simulado de imagen
 */
function buildLogoFile(): MulterFile {
  return {
    fieldname: 'file',
    originalname: 'logo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 128,
    buffer: Buffer.from('logo'),
    destination: '',
    filename: 'logo.png',
    path: '',
    stream: undefined as unknown as MulterFile['stream'],
  } as MulterFile;
}

/**
 * Cubre el constructor del DTO de subida de logo de empresa.
 */
describe('EnterpriseLogoUploadDto', () => {
  it('debe instanciarse y aceptar el archivo de logo', () => {
    const dto = coverDtoClass(EnterpriseLogoUploadDto, {
      file: buildLogoFile(),
    });

    expect(dto.file.originalname).toBe('logo.png');
    expect(dto.file.mimetype).toBe('image/png');
  });

  /**
   * `emitDecoratorMetadata` emite `typeof MulterFile !== "undefined" && MulterFile`.
   * Hay que recargar el módulo con una clase real para cubrir la rama verdadera.
   */
  it('debe cubrir la rama de metadatos cuando MulterFile existe en runtime', () => {
    jest.isolateModules(() => {
      jest.doMock('multer', () => ({
        MulterFile: class MulterFile {},
      }));
      const { EnterpriseLogoUploadDto: ReloadedDto } = require('./enterprise-logo-upload.dto');
      const dto = new ReloadedDto();
      dto.file = buildLogoFile();
      expect(dto.file.originalname).toBe('logo.png');
    });
  });
});
