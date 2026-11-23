import { z } from 'zod';
import { AppError } from '../../shared/errors.js';

export const indiaPhone = z
  .string()
  .trim()
  .regex(/^(?:\+91)?[6-9]\d{9}$/)
  .transform((phone) => (phone.startsWith('+91') ? phone : `+91${phone}`));

export async function verifyBySms(phone: string, code?: string) {
  const {
    TWILIO_VERIFY_SERVICE_SID: service,
    TWILIO_API_KEY_SID: key,
    TWILIO_API_KEY_SECRET: secret,
  } = process.env;
  if (!service || !/^VA[a-f0-9]{32}$/i.test(service) || !key || !secret)
    throw new AppError(
      503,
      'PHONE_SIGN_IN_UNAVAILABLE',
      'Phone sign-in is temporarily unavailable.',
    );

  const action = code === undefined ? 'Verifications' : 'VerificationCheck';
  let response: Response;
  try {
    response = await fetch(`https://verify.twilio.com/v2/Services/${service}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
      body: new URLSearchParams({
        To: phone,
        ...(code === undefined ? { Channel: 'sms' } : { Code: code }),
      }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
  } catch {
    throw new AppError(
      503,
      'PHONE_SIGN_IN_UNAVAILABLE',
      'Phone sign-in is temporarily unavailable.',
    );
  }
  const result = await response.json().catch(() => null);
  if (response.status === 429)
    throw new AppError(429, 'OTP_RATE_LIMITED', 'Too many attempts. Wait before trying again.');
  if (
    code !== undefined &&
    (response.status === 404 || (response.ok && result?.status !== 'approved'))
  )
    throw new AppError(
      400,
      'OTP_INVALID',
      'The code is incorrect or expired. Check it or request a new one.',
    );
  if (
    !response.ok ||
    result?.to !== phone ||
    result?.status !== (code === undefined ? 'pending' : 'approved')
  )
    throw new AppError(
      503,
      'PHONE_SIGN_IN_UNAVAILABLE',
      'Phone sign-in is temporarily unavailable.',
    );
}
