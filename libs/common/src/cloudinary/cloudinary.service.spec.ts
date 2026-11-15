import { BadRequestException } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService File Validation', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    service = new CloudinaryService();
  });

  it('should reject missing or empty file', async () => {
    await expect(service.uploadImage(null as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject file exceeding 5MB', async () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 10);
    const mockFile: any = {
      buffer: largeBuffer,
      size: largeBuffer.length,
      mimetype: 'image/png',
    };
    await expect(service.uploadImage(mockFile)).rejects.toThrow(
      'Kích thước ảnh tối đa cho phép là 5MB',
    );
  });

  it('should reject non-image mimetype', async () => {
    const mockFile: any = {
      buffer: Buffer.from('console.log("hello");'),
      size: 100,
      mimetype: 'application/javascript',
    };
    await expect(service.uploadImage(mockFile)).rejects.toThrow(
      'Chỉ chấp nhận file hình ảnh hợp lệ (PNG, JPG, JPEG, WEBP, GIF)',
    );
  });

  it('should reject file with image mimetype but invalid magic bytes (content spoofing)', async () => {
    const mockFile: any = {
      buffer: Buffer.from('<?php echo "evil"; ?>'),
      size: 100,
      mimetype: 'image/png',
    };
    await expect(service.uploadImage(mockFile)).rejects.toThrow(
      'Nội dung file không đúng với định dạng hình ảnh hợp lệ',
    );
  });
});
