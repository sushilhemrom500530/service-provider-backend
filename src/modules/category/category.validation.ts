import { z } from 'zod';
 
const createCategory=z.object({
  body:z.object({
    fullName:z.string().optional(),
    age:z.string().optional(),
    gender:z.string().optional(),
    aboutMe:z.string().optional(),
  })
})

export const CategoryValidation = {
  createCategory, 
};
