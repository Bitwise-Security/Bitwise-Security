import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use no more than 128 characters")
  .refine((password) => !/[\u0000-\u001f\u007f]/u.test(password), {
    message: "Control characters are not allowed",
  });

