import nodemailer from 'nodemailer';
export async function sendResetEmail(email, url) {
  if (!process.env.SMTP_HOST) throw new Error('Password reset email is not configured. Contact your administrator.');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || 'no-reply@example.com', to: email, subject: 'Reset your ZendX Social password', text: `Reset your password using this link (expires in one hour):\n${url}` });
}
