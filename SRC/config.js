// Public backend URL only. Do not embed keys, PSP secrets or admin passwords in the APK.
// Set via EXPO_PUBLIC_API_URL in the EAS build environment once backend is deployed.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
export const CURRENCY = 'CHF';
