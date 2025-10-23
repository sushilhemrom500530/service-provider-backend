import { z } from "zod";

 
export const createSettingsValidation = z.object({
    content: z
      .string({
        required_error: "Content is required",
        invalid_type_error: "Content must be a string",
      })
      .min(5, "Content must be at least 5 characters long")
      
});
