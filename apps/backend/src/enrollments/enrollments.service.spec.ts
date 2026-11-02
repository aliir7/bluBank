import { sendOtpSchema } from './dto/send-otp.dto.js';
import { EnrollmentsService } from './enrollments.service.js';

describe('EnrollmentsService', () => {
  const service = new EnrollmentsService();

  it('returns a 6-digit code for the phone number', () => {
    const result = service.sendOtp({ phone: '09121234567' });
    expect(result.phone).toBe('09121234567');
    expect(result.code).toMatch(/^[1-9]\d{5}$/);
    expect(result.expiresIn).toBe(120);
  });
});

describe('sendOtpSchema', () => {
  it.each(['09121234567', ' 0912 123 4567 ', '9121234567'])('accepts %s', (phone) => {
    const parsed = sendOtpSchema.parse({ phone });
    expect(parsed.phone).toBe(phone.trim().replace(/\s+/g, ''));
  });

  it('accepts +98 prefix without normalization', () => {
    const parsed = sendOtpSchema.parse({ phone: '+989121234567' });
    expect(parsed.phone).toBe('+989121234567');
  });

  it.each(['0912123456', '08121234567', '+19121234567', '0912abc4567', ''])(
    'rejects %s',
    (phone) => {
      expect(sendOtpSchema.safeParse({ phone }).success).toBe(false);
    },
  );
});
