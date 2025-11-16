import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

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
            error: { message: 'Invalid subCategory JSON format' },
          });
        }
      }

      // Run Zod validation
      await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
        cookies: req.cookies,
      });

      next();
    } catch (error) {
      next(error);
    }
  };

export default validateRequest;


// import { NextFunction, Request, Response } from 'express';
// import { AnyZodObject } from 'zod';

// const validateRequest =
//   (schema: AnyZodObject) =>
//   async (req: Request, res: Response, next: NextFunction) => {
//     try { 
//       await schema.parseAsync({
//         body: req.body,
//         params: req.params,
//         query: req.query,
//         cookies: req.cookies,
//       });

//       next();
//     } catch (error) {
//       next(error);
//     }
//   };

// export default validateRequest;

 