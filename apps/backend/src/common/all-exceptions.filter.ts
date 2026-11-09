import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, type ApiErrorDetails } from './api-error.js';
import { ERROR_CODES } from './error-codes.js';

interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetails;
}

/**
 * Formats every error that reaches Nest into the shared API envelope:
 * `{ statusCode, code, message, details? }`.
 *
 * Business errors carry their own code/details. Framework errors keep their
 * real status code and are mapped by kind:
 * - 400/422 -> `validation_failed` (e.g. malformed JSON);
 * - 404 -> `not_found` (unknown routes);
 * - any other 4xx -> `request_error` (e.g. 405 Method Not Allowed).
 *
 * Anything else is logged and sanitized to 500 `internal_error` so internals
 * never leak to the client.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const envelope = this.toEnvelope(exception);

    response.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof ApiError) {
      const envelope: ErrorEnvelope = {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
      };
      if (exception.details !== undefined) {
        envelope.details = exception.details;
      }
      return envelope;
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      statusCode: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  private fromHttpException(exception: HttpException): ErrorEnvelope {
    const statusCode = exception.getStatus();

    if (statusCode === 404) {
      return {
        statusCode,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Route not found',
      };
    }

    if (statusCode === 400 || statusCode === 422) {
      // Malformed JSON and other framework-level validation errors carry no
      // field-level information, so the envelope uses an empty field list.
      return {
        statusCode,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Request validation failed',
        details: { fields: [] },
      };
    }

    if (statusCode < 500) {
      // Other framework client errors (405, 406, 413, ...) are not field
      // validation; keep the real status and use the transport-level code.
      return {
        statusCode,
        code: ERROR_CODES.REQUEST_ERROR,
        message: 'Request could not be processed',
      };
    }

    this.logger.error(`Unhandled HTTP error (${statusCode})`, exception.stack);

    return {
      statusCode,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }
}
