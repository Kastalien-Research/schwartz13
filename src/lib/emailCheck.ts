import { resolveMx } from 'dns/promises';

export interface EmailCheckResult {
  email: string;
  formatValid: boolean;
  domainHasMx: boolean | null;
  mxRecords: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function checkEmail(email: string): Promise<EmailCheckResult> {
  const formatValid = EMAIL_RE.test(email);
  if (!formatValid) {
    return { email, formatValid, domainHasMx: null, mxRecords: [] };
  }

  const domain = email.split('@')[1];
  try {
    const records = await resolveMx(domain);
    const sorted = records.sort((a, b) => a.priority - b.priority);
    return {
      email,
      formatValid: true,
      domainHasMx: sorted.length > 0,
      mxRecords: sorted.map(r => r.exchange),
    };
  } catch {
    return { email, formatValid: true, domainHasMx: false, mxRecords: [] };
  }
}
