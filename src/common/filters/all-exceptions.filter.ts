import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

// Catches anything Nest's default handler would otherwise reach — a raw
// Error, a TypeORM connection failure, etc. Without this, an unexpected
// error skips this project's { code, message } contract entirely and
// never shows up in the structured [service-name] - message logs the
// rest of the app relies on.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      // Already a deliberate response — either this project's own
      // { code, message } shape or Nest's built-in validation-error
      // shape — pass it through untouched.
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    this.logger.error('[exception-filter] - unhandled exception.', exception);

    // Never leak the real error (stack trace, DB connection string, etc.)
    // to the client — only the generic, already-logged message above.
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  }
}
