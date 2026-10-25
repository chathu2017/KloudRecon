/** Where a recommendation comes from (hub source keys). */
export const SOURCE_NAMES: Record<string, string> = {
  rule: 'KloudRecon rule',
  advisor: 'Azure Advisor',
  defender: 'Defender for Cloud',
  policy: 'Azure Policy',
  toxic: 'Toxic combination',
  custom: 'Custom rule',
  rightsizing: 'Rightsizing',
  waste: 'Waste finder',
  commitment: 'Commitments',
};
