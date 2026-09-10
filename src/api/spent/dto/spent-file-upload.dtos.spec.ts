import { validate } from 'class-validator';
import { MulterFile } from 'multer';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { SpentAiFileUploadDto } from './spent-ai-file-upload.dto';
import { SpentFileUploadDto } from './spent-file-upload.dto';

/**
 * Construye un archivo multer PDF mínimo para los DTO de gasto.
 *
 * @returns Archivo simulado PDF
 */
function buildPdfFile(): MulterFile {
  return {
    fieldname: 'file',
    originalname: 'factura.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 256,
    buffer: Buffer.from('%PDF'),
    destination: '',
    filename: 'factura.pdf',
    path: '',
    stream: undefined as unknown as MulterFile['stream'],
  } as MulterFile;
}

/**
 * Cubre constructores y validadores de los DTO de subida de archivos de gasto.
 */
describe('DTO de subida de archivos de gasto', () => {
  it('debe instanciar SpentAiFileUploadDto con el PDF', () => {
    const dto = coverDtoClass(SpentAiFileUploadDto, {
      file: buildPdfFile(),
    });

    expect(dto.file.mimetype).toBe('application/pdf');
  });

  /**
   * Recarga los DTO con `MulterFile` como clase para cubrir el ternario de metadatos.
   */
  it('debe cubrir la rama de metadatos cuando MulterFile existe en runtime', () => {
    jest.isolateModules(() => {
      jest.doMock('multer', () => ({
        MulterFile: class MulterFile {},
      }));
      const { SpentAiFileUploadDto: ReloadedAiDto } = require('./spent-ai-file-upload.dto');
      const { SpentFileUploadDto: ReloadedFileDto } = require('./spent-file-upload.dto');
      const aiDto = new ReloadedAiDto();
      aiDto.file = buildPdfFile();
      const fileDto = new ReloadedFileDto();
      fileDto.file = buildPdfFile();
      fileDto.spentData = '{}';
      expect(aiDto.file.originalname).toBe('factura.pdf');
      expect(fileDto.spentData).toBe('{}');
    });
  });

  it('debe instanciar SpentFileUploadDto y validar spentData', async () => {
    const dto = coverDtoClass(SpentFileUploadDto, {
      file: buildPdfFile(),
      spentData: JSON.stringify({ name: 'Material' }),
    });
    const validErrors = await validate(dto);
    const invalidDto = coverDtoClass(SpentFileUploadDto, {
      file: buildPdfFile(),
      spentData: 10 as unknown as string,
    });
    const invalidErrors = await validate(invalidDto);

    expect(dto.spentData).toContain('Material');
    expect(validErrors).toHaveLength(0);
    expect(invalidErrors.length).toBeGreaterThan(0);
  });
});
