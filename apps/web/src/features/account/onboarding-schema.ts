import { z } from 'zod';

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5000+'] as const;

/** Shown beside each size in the onboarding select. */
export const COMPANY_SIZE_HINTS: Record<(typeof COMPANY_SIZES)[number], string> = {
  '1-10': 'Startup',
  '11-50': 'Small team',
  '51-200': 'Growing',
  '201-1000': 'Mid-size',
  '1001-5000': 'Large',
  '5000+': 'Enterprise',
};

/** Mirrors the API's OnboardingIn validation so users see errors before submitting. */
export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(200),
  job_title: z.string().trim().min(1, 'Enter your job title.').max(120),
  company: z.string().trim().min(2, 'Enter your company name.').max(200),
  country: z.string().trim().min(2, 'Enter your country.').max(80),
  company_size: z.enum(COMPANY_SIZES, { error: 'Choose a company size.' }),
  industry: z.string().trim().max(80),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+0-9 ()-]*$/, 'Digits, spaces, +, - and parentheses only.'),
  use_case: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(2000),
  accept_terms: z.boolean().refine((v) => v, 'You must accept the Terms and Privacy Policy.'),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
