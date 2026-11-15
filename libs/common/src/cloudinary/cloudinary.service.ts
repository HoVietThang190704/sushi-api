import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'sushi-platform/products',
  ): Promise<{ url: string; publicId: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh hợp lệ');
    }

    // Giới hạn kích thước file 5MB
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Kích thước ảnh tối đa cho phép là 5MB');
    }

    const ALLOWED_MIME_TYPES = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    const mime = file.mimetype?.toLowerCase();
    if (!mime || !ALLOWED_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(
        'Chỉ chấp nhận file hình ảnh hợp lệ (PNG, JPG, JPEG, WEBP, GIF)',
      );
    }

    // Kiểm tra chữ ký nhị phân (magic bytes) để ngăn chặn giả mạo phần mở rộng file
    const buf = file.buffer;
    const isImageSignature = (b: Buffer): boolean => {
      if (b.length < 4) return false;
      // JPEG: FF D8 FF
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
      // PNG: 89 50 4E 47
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
        return true;
      // GIF: 47 49 46 38
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
        return true;
      // WEBP: RIFF....WEBP
      if (
        b.length >= 12 &&
        b.toString('ascii', 0, 4) === 'RIFF' &&
        b.toString('ascii', 8, 12) === 'WEBP'
      ) {
        return true;
      }
      return false;
    };

    if (!isImageSignature(buf)) {
      throw new BadRequestException(
        'Nội dung file không đúng với định dạng hình ảnh hợp lệ',
      );
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(
              new BadRequestException(
                error?.message || 'Tải ảnh lên Cloudinary thất bại',
              ),
            );
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }
}
