import { z } from "zod";

 
export const createAboutValidation = z.object({
    content: z
      .string({
        required_error: "Content is required",
        invalid_type_error: "Content must be a string",
      })
      .min(5, "Content must be at least 5 characters long")
      .refine((val) => /<\/?[a-z][\s\S]*>/i.test(val), {
        message: "Content must contain valid HTML",
      }),
});
