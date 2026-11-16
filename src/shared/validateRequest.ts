import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

/**
 * Validates body / params / query with a Zod schema and writes the parsed
 * values back, so zod coercion (z.coerce) and defaults really apply.
 *
 * The parsed body is MERGED over the raw body (fields the schema doesn't
 * list are kept) so existing services that read extra multipart fields keep
 * working. Services must whitelist what they save (no `...req.body`).
 */
const validateRequest =
  (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // --- Parse subCategory if it comes as a string (from FormData) ---
      if (req.body?.subCategory && typeof req.body.subCategory === 'string') {
        try {
          req.body.subCategory = JSON.parse(req.body.subCategory);
        } catch {
          return res.status(400).json({
            success: false,
            message: 'Invalid subCategory JSON format',
          });
        }
      }

      const parsed: any = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
        cookies: req.cookies,
      });

      if (parsed?.body && typeof parsed.body === 'object' && !Array.isArray(parsed.body))
        req.body = { ...(req.body || {}), ...parsed.body };
      if (parsed?.query && typeof parsed.query === 'object') {
        // req.query is a getter in Express 5: copy the values onto it
        for (const [k, v] of Object.entries(parsed.query))
          (req.query as any)[k] = v;
      }

      next();
    } catch (error) {
      next(error);
    }
  };

export default validateRequest;

/**
 * Multipart/form-data sends arrays and objects as JSON strings.
 * Parse the listed fields before validation; a bad JSON string is a 400.
 *   router.post('/', upload, parseJsonFields(['items', 'slots']), validateRequest(schema), ...)
 */
export const parseJsonFields =
  (fields: string[]) => (req: Request, res: Response, next: NextFunction) => {
    for (const field of fields) {
      const value = req.body?.[field];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) {
        delete req.body[field];
        continue;
      }
      if (!['[', '{'].includes(trimmed[0])) continue;
      try {
        req.body[field] = JSON.parse(trimmed);
      } catch {
        return res.status(400).json({
          success: false,
          message: `"${field}" must be valid JSON.`,
        });
      }
    }
    next();
  };
