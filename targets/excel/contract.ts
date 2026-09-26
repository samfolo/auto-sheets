import * as z from 'zod';

export const signInCodeSchema = z
  .string()
  .regex(/^\d{6}$/, { error: 'is not six digits' })
  .meta({
    description:
      'The one-time code Microsoft emails to the test account when `excel sign-in` asks for one.',
  });
