const nodemailer = require('nodemailer');
const config = require('../../src/config/env');
const {
  buildReferralAcceptedEmail,
  sendReferralAccepted,
  sendReferralDecision,
  sendAssignmentUpdate,
  sendStaleResourceReminder
} = require('../../src/services/email.service');

jest.mock('nodemailer', () => ({
  createTransport: jest.fn()
}));

describe('referral acceptance email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.SMTP_HOST = 'smtp.example.test';
    config.SMTP_PORT = 587;
    config.SMTP_SECURE = false;
    config.SMTP_USER = 'mailer';
    config.SMTP_PASSWORD = 'test-password';
    config.SMTP_FROM = 'EmergencyLink <alerts@example.test>';
    config.APP_URL = 'https://emergencylink.example.test';
  });

  test('renders a branded HTML and text message with escaped dynamic values', () => {
    const message = buildReferralAcceptedEmail({
      recipientName: '<Coordinator>',
      caseId: 'CASE<&>',
      hospitalName: 'City <Care>',
      appUrl: 'https://app.example.test/?a=1&b=2'
    });

    expect(message.subject).toBe('EmergencyLink: referral accepted for CASE<&>');
    expect(message.html).toContain('background:#152724');
    expect(message.html).toContain('background:#177a63');
    expect(message.html).toContain('&lt;Coordinator&gt;');
    expect(message.html).toContain('CASE&lt;&amp;&gt;');
    expect(message.html).toContain('City &lt;Care&gt;');
    expect(message.html).toContain('?a=1&amp;b=2');
    expect(message.html).not.toContain('<Coordinator>');
    expect(message.text).toContain('CASE<&>');
  });

  test('sends the accepted case notification to the original requester', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'sent-1' });
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const result = await sendReferralAccepted({
      caseId: 'CASE-42',
      requestStatus: 'accepted',
      requestedBy: { name: 'Coordinator', email: 'coord@example.test' },
      hospitalId: { name: 'City Care Hospital' }
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      auth: { user: 'mailer', pass: 'test-password' }
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'EmergencyLink <alerts@example.test>',
      to: 'coord@example.test',
      subject: 'EmergencyLink: referral accepted for CASE-42',
      text: expect.stringContaining('City Care Hospital'),
      html: expect.stringContaining('City Care Hospital')
    }));
    expect(result.messageId).toBe('sent-1');

    await sendReferralDecision({
      caseId: 'CASE-42',
      requestStatus: 'rejected',
      requestedBy: { name: 'Coordinator', email: 'coord@example.test' },
      hospitalId: { name: 'City Care Hospital' }
    });
    await sendReferralDecision({
      caseId: 'CASE-42',
      requestStatus: 'clarification_requested',
      requestedBy: { name: 'Coordinator', email: 'coord@example.test' },
      hospitalId: { name: 'City Care Hospital' }
    });
    await sendAssignmentUpdate({
      caseId: 'CASE-42',
      status: 'en_route',
      ambulanceId: { ambulanceId: 'AMB-01' },
      destinationHospitalId: { name: 'City Care Hospital' }
    }, [
      { name: 'Coordinator', email: 'coord@example.test' },
      { name: 'Ambulance staff', email: 'driver@example.test' },
      { name: 'Duplicate coordinator', email: 'COORD@example.test' }
    ]);
    await sendStaleResourceReminder({
      recipient: { name: 'Hospital staff', email: 'hospital@example.test' },
      hospitalName: 'City Care Hospital',
      staleResources: [{ resourceType: 'icu_bed', ageMinutes: 135 }],
      staleAfterMinutes: 120
    });

    const deliveredRecipients = sendMail.mock.calls.map(([message]) => message.to);
    expect(deliveredRecipients).toEqual([
      'coord@example.test',
      'coord@example.test',
      'coord@example.test',
      'coord@example.test',
      'driver@example.test',
      'hospital@example.test'
    ]);
    expect(sendMail.mock.calls[1][0].subject).toMatch(/referral update/i);
    expect(sendMail.mock.calls[2][0].subject).toMatch(/clarification requested/i);
    expect(sendMail.mock.calls[3][0].subject).toMatch(/ambulance en route/i);
    expect(sendMail.mock.calls[5][0].subject).toMatch(/resource report reminder/i);
  });
});
