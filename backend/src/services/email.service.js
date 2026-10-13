const nodemailer = require('nodemailer');
const config = require('../config/env');

let transporter;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTransporter() {
  if (!config.SMTP_HOST || !config.SMTP_FROM) {
    throw new Error('SMTP email is not configured; set SMTP_HOST and SMTP_FROM.');
  }

  if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.');
  }

  if (!transporter) {
    const transportOptions = {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    };

    if (config.SMTP_USER) {
      transportOptions.auth = {
        user: config.SMTP_USER,
        pass: config.SMTP_PASSWORD
      };
    }

    transporter = nodemailer.createTransport(transportOptions);
  }

  return transporter;
}

function buildReferralAcceptedEmail({ recipientName, caseId, hospitalName, appUrl }) {
  const safeName = escapeHtml(recipientName || 'Coordinator');
  const safeCaseId = escapeHtml(caseId);
  const safeHospitalName = escapeHtml(hospitalName);
  const safeAppUrl = escapeHtml(appUrl);

  return {
    subject: `EmergencyLink: referral accepted for ${caseId}`,
    text: [
      `Hello ${recipientName || 'Coordinator'},`,
      '',
      `The hospital has accepted the referral for case ${caseId}.`,
      `Destination: ${hospitalName}.`,
      '',
      `Sign in to EmergencyLink to review the case: ${appUrl}`,
      '',
      'This is an automated operational notification. Do not reply to this email.'
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:32px 12px;background:#f5f7f6;font-family:'Segoe UI',Arial,sans-serif;color:#1d2b2a">
    <div style="display:none;max-height:0;overflow:hidden">The hospital accepted the EmergencyLink referral for ${safeCaseId}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6ebe8;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px;background:#152724">
        <div style="font-size:21px;font-weight:800;letter-spacing:-.6px;color:#fff">Emergency<span style="color:#70cfad">Link</span></div>
        <div style="margin-top:5px;color:#aebfb8;font-size:12px">Emergency coordination update</div>
      </td></tr>
      <tr><td style="padding:30px 28px 12px">
        <div style="display:inline-block;padding:6px 10px;border-radius:20px;background:#e5f3ee;color:#177a63;font-size:11px;font-weight:700">REFERRAL ACCEPTED</div>
        <h1 style="margin:18px 0 8px;font-size:23px;line-height:1.3;color:#1d2b2a">A hospital accepted your request</h1>
        <p style="margin:0;color:#61716b;font-size:14px;line-height:1.7">Hello ${safeName}, the referral has been accepted and a destination is now confirmed.</p>
      </td></tr>
      <tr><td style="padding:20px 28px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6ebe8;border-radius:9px;background:#f9fbfa">
          <tr><td style="padding:14px 16px;border-bottom:1px solid #e6ebe8;color:#778481;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Case reference</td></tr>
          <tr><td style="padding:10px 16px 14px;color:#1d2b2a;font-size:15px;font-weight:700">${safeCaseId}</td></tr>
          <tr><td style="padding:12px 16px;border-top:1px solid #e6ebe8;color:#778481;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Confirmed destination</td></tr>
          <tr><td style="padding:8px 16px 15px;color:#1d2b2a;font-size:14px;font-weight:600">${safeHospitalName}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:4px 28px 30px">
        <a href="${safeAppUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#177a63;color:#fff;font-size:13px;font-weight:700;text-decoration:none">Open EmergencyLink</a>
        <p style="margin:20px 0 0;color:#778481;font-size:12px;line-height:1.6">This message contains only the operational case reference. Sign in to review details in the application.</p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e6ebe8;color:#87938f;font-size:11px;line-height:1.6">Automated EmergencyLink notification. Please do not reply to this email.</td></tr>
    </table>
  </body>
</html>`
  };
}

function buildBrandedEmail({ badge, title, greeting, intro, details, appUrl }) {
  const safeGreeting = escapeHtml(greeting || 'EmergencyLink user');
  const safeBadge = escapeHtml(badge);
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const detailRows = details.map(({ label, value }) =>
    `<tr><td style="padding:11px 16px;border-top:1px solid #e6ebe8"><div style="color:#778481;font-size:10px;text-transform:uppercase;letter-spacing:.7px">${escapeHtml(label)}</div><div style="margin-top:5px;color:#1d2b2a;font-size:14px;font-weight:600">${escapeHtml(value)}</div></td></tr>`
  ).join('');
  const safeAppUrl = escapeHtml(appUrl);

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:32px 12px;background:#f5f7f6;font-family:'Segoe UI',Arial,sans-serif;color:#1d2b2a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6ebe8;border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px;background:#152724">
        <div style="font-size:21px;font-weight:800;letter-spacing:-.6px;color:#fff">Emergency<span style="color:#70cfad">Link</span></div>
        <div style="margin-top:5px;color:#aebfb8;font-size:12px">Emergency coordination update</div>
      </td></tr>
      <tr><td style="padding:28px 28px 12px">
        <div style="display:inline-block;padding:6px 10px;border-radius:20px;background:#e5f3ee;color:#177a63;font-size:11px;font-weight:700">${safeBadge}</div>
        <h1 style="margin:18px 0 8px;font-size:23px;line-height:1.3;color:#1d2b2a">${safeTitle}</h1>
        <p style="margin:0;color:#61716b;font-size:14px;line-height:1.7">Hello ${safeGreeting}, ${safeIntro}</p>
      </td></tr>
      <tr><td style="padding:18px 28px 22px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6ebe8;border-radius:9px;background:#f9fbfa">${detailRows}</table>
      </td></tr>
      <tr><td style="padding:0 28px 28px">
        <a href="${safeAppUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#177a63;color:#fff;font-size:13px;font-weight:700;text-decoration:none">Open EmergencyLink</a>
        <p style="margin:18px 0 0;color:#778481;font-size:12px;line-height:1.6">This message contains operational details only. Sign in to review permitted information in the application.</p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e6ebe8;color:#87938f;font-size:11px;line-height:1.6">Automated EmergencyLink notification. Please do not reply to this email.</td></tr>
    </table>
  </body>
</html>`;
}

async function deliver({ to, subject, text, html }) {
  return getTransporter().sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
    html
  });
}

async function sendReferralDecision(referral) {
  const recipient = referral.requestedBy;
  const email = recipient && recipient.email;
  if (!email) {
    throw new Error('Cannot send referral notification: requester email is unavailable.');
  }

  const hospital = referral.hospitalId;
  const caseId = referral.caseId;
  const hospitalName = hospital && hospital.name;
  const status = referral.requestStatus;
  const statusCopy = {
    accepted: {
      badge: 'REFERRAL ACCEPTED',
      title: 'A hospital accepted your request',
      intro: 'the referral has been accepted and a destination is now confirmed.',
      subject: `EmergencyLink: referral accepted for ${caseId}`
    },
    rejected: {
      badge: 'REFERRAL UPDATE',
      title: 'A hospital could not accept the request',
      intro: 'the hospital declined this referral. Sign in to review the case and next steps.',
      subject: `EmergencyLink: referral update for ${caseId}`
    },
    clarification_requested: {
      badge: 'ACTION REQUESTED',
      title: 'A hospital requested clarification',
      intro: 'the hospital needs more information before it can make a decision. Sign in to review and respond.',
      subject: `EmergencyLink: clarification requested for ${caseId}`
    }
  }[status];

  if (!caseId || !hospitalName || !statusCopy) {
    throw new Error('Cannot send referral notification: case, hospital, or decision details are unavailable.');
  }

  const details = [
    { label: 'Case reference', value: caseId },
    { label: 'Hospital', value: hospitalName },
    { label: 'Referral status', value: status.replace(/_/g, ' ') }
  ];
  const html = status === 'accepted'
    ? buildReferralAcceptedEmail({
      recipientName: recipient.name,
      caseId,
      hospitalName,
      appUrl: config.APP_URL
    }).html
    : buildBrandedEmail({
      ...statusCopy,
      greeting: recipient.name,
      details,
      appUrl: config.APP_URL
    });

  return deliver({
    to: email,
    subject: statusCopy.subject,
    text: [
      `Hello ${recipient.name || 'Coordinator'},`,
      '',
      statusCopy.intro,
      `Case: ${caseId}`,
      `Hospital: ${hospitalName}`,
      `Referral status: ${status.replace(/_/g, ' ')}`,
      '',
      `Sign in to EmergencyLink: ${config.APP_URL}`,
      '',
      'This is an automated operational notification. Do not reply to this email.'
    ].join('\n'),
    html
  });
}

async function sendAssignmentUpdate(assignment, recipients) {
  const caseId = assignment.caseId;
  const ambulanceId = assignment.ambulanceId && assignment.ambulanceId.ambulanceId;
  const hospitalName = assignment.destinationHospitalId && assignment.destinationHospitalId.name;
  const status = assignment.status;

  if (!caseId || !ambulanceId || !hospitalName || !status) {
    throw new Error('Cannot send ambulance notification: assignment details are unavailable.');
  }

  const recipientsByEmail = new Map();
  for (const recipient of recipients) {
    if (recipient && recipient.email && !recipientsByEmail.has(recipient.email.toLowerCase())) {
      recipientsByEmail.set(recipient.email.toLowerCase(), recipient);
    }
  }
  const uniqueRecipients = [...recipientsByEmail.values()];
  if (!uniqueRecipients.length) return [];

  const statusLabel = status.replace(/_/g, ' ');
  const subject = `EmergencyLink: ambulance ${statusLabel} for ${caseId}`;
  const text = [
    'EmergencyLink assignment update',
    '',
    `Case: ${caseId}`,
    `Ambulance: ${ambulanceId}`,
    `Destination: ${hospitalName}`,
    `Status: ${statusLabel}`,
    '',
    `Sign in to EmergencyLink: ${config.APP_URL}`
  ].join('\n');
  const html = buildBrandedEmail({
    badge: 'AMBULANCE UPDATE',
    title: 'Ambulance assignment update',
    greeting: 'EmergencyLink user',
    intro: `the ambulance assignment status is now ${statusLabel}.`,
    details: [
      { label: 'Case reference', value: caseId },
      { label: 'Ambulance', value: ambulanceId },
      { label: 'Destination', value: hospitalName },
      { label: 'Status', value: statusLabel }
    ],
    appUrl: config.APP_URL
  });

  return Promise.all(uniqueRecipients.map(({ email }) => deliver({
    to: email,
    subject,
    text,
    html
  })));
}

async function sendStaleResourceReminder({ recipient, hospitalName, staleResources, staleAfterMinutes }) {
  if (!recipient || !recipient.email) {
    throw new Error('Cannot send stale-resource reminder: recipient email is unavailable.');
  }
  if (!hospitalName || !Array.isArray(staleResources) || !staleResources.length) {
    throw new Error('Cannot send stale-resource reminder: hospital or stale resource details are unavailable.');
  }

  const resourceSummary = staleResources
    .map(({ resourceType, ageMinutes }) => `${resourceType.replace(/_/g, ' ')} (${ageMinutes} minutes old)`)
    .join(', ');
  const details = [
    { label: 'Hospital', value: hospitalName },
    { label: 'Stale resources', value: resourceSummary },
    { label: 'Stale threshold', value: `${staleAfterMinutes} minutes` }
  ];
  const html = buildBrandedEmail({
    badge: 'RESOURCE REPORT REMINDER',
    title: 'Hospital resource report is stale',
    greeting: recipient.name,
    intro: 'one or more resource reports have passed the configured freshness threshold. Please review and update them.',
    details,
    appUrl: config.APP_URL
  });

  return deliver({
    to: recipient.email,
    subject: `EmergencyLink: resource report reminder for ${hospitalName}`,
    text: [
      `Hello ${recipient.name || 'Hospital team'},`,
      '',
      `Resource information for ${hospitalName} is older than the ${staleAfterMinutes}-minute freshness threshold.`,
      `Stale resources: ${resourceSummary}`,
      '',
      `Sign in to EmergencyLink to review and update the report: ${config.APP_URL}`
    ].join('\n'),
    html
  });
}

async function sendReferralAccepted(referral) {
  if (referral.requestStatus !== 'accepted') {
    throw new Error('Referral acceptance notification requires an accepted referral.');
  }
  return sendReferralDecision(referral);
}

module.exports = {
  sendReferralAccepted,
  sendReferralDecision,
  sendAssignmentUpdate,
  sendStaleResourceReminder,
  buildReferralAcceptedEmail,
  buildBrandedEmail
};
