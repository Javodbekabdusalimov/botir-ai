import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

interface UploadedFile {
  fieldname: string;
  filename: string;
  buffer: Buffer;
  size: number;
}

interface RequestWithFile extends Request {
  /** Named `file` so Nest's @UploadedFile() decorator picks it up, same as Multer. */
  file?: UploadedFile;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const BOUNDARY_PREFIX = 'multipart/form-data';

/**
 * Minimal multipart reader for a single file field. Multer is avoided on purpose:
 * one upload endpoint does not justify another dependency, and the parser stays
 * bounded by MAX_BODY_BYTES so a large upload cannot exhaust memory.
 */
@Injectable()
export class FileInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<RequestWithFile>();
    const contentType = req.headers['content-type'] ?? '';

    if (!contentType.startsWith(BOUNDARY_PREFIX)) {
      throw new BadRequestException('expected multipart/form-data');
    }

    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
    if (!boundary) throw new BadRequestException('multipart boundary is missing');

    const body = await this.readBody(req);
    req.file = this.parseFirstFile(body, boundary);
    return next.handle();
  }

  private readBody(req: Request): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new BadRequestException('upload is larger than 5 MB'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', (error) => reject(error));
    });
  }

  private parseFirstFile(body: Buffer, boundary: string): UploadedFile | undefined {
    const delimiter = Buffer.from(`--${boundary}`);
    const parts: Buffer[] = [];
    let cursor = body.indexOf(delimiter);

    while (cursor !== -1) {
      const start = cursor + delimiter.length;
      const nextDelimiter = body.indexOf(delimiter, start);
      if (nextDelimiter === -1) break;
      parts.push(body.subarray(start, nextDelimiter));
      cursor = nextDelimiter;
    }

    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;

      const headers = part.subarray(0, headerEnd).toString('utf8');
      const disposition = /name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
      if (!disposition || !disposition[2]) continue;

      // Content ends with a trailing CRLF that belongs to the delimiter, not the file.
      const content = part.subarray(headerEnd + 4, part.length - 2);
      return {
        fieldname: disposition[1],
        filename: disposition[2],
        buffer: content,
        size: content.length,
      };
    }

    return undefined;
  }
}
