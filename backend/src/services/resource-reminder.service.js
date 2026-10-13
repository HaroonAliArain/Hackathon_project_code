const config = require('../config/env');
const Hospital = require('../models/Hospital');
const ResourceSnapshot = require('../models/ResourceSnapshot');
const ResourceReminder = require('../models/ResourceReminder');
const User = require('../models/User');
const emailService = require('./email.service');

const LEASE_MILLISECONDS = 5 * 60 * 1000;

async function claimHospitalReminder(hospitalId, now) {
  const cutoff = new Date(now.getTime() - config.RESOURCE_REMINDER_REPEAT_HOURS * 60 * 60 * 1000);
  const lockUntil = new Date(now.getTime() + LEASE_MILLISECONDS);
  let reminder = await ResourceReminder.findOne({ hospitalId });

  if (!reminder) {
    try {
      await ResourceReminder.create({ hospitalId, lockUntil });
      return true;
    } catch (error) {
      if (error.code !== 11000) throw error;
      reminder = await ResourceReminder.findOne({ hospitalId });
    }
  }

  if (!reminder || (reminder.lastSentAt && reminder.lastSentAt > cutoff)) return false;
  if (reminder.lockUntil && reminder.lockUntil > now) return false;

  const claimed = await ResourceReminder.findOneAndUpdate(
    {
      _id: reminder._id,
      $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }]
    },
    { $set: { lockUntil } },
    { new: true }
  );
  return Boolean(claimed);
}

async function finishHospitalReminder(hospitalId, sentAt) {
  await ResourceReminder.updateOne(
    { hospitalId },
    { $set: { lastSentAt: sentAt }, $unset: { lockUntil: 1 } }
  );
}

async function releaseHospitalReminder(hospitalId) {
  await ResourceReminder.updateOne(
    { hospitalId },
    { $unset: { lockUntil: 1 } }
  );
}

async function runResourceReminderCheck(now = new Date()) {
  const snapshots = await ResourceSnapshot.aggregate([
    { $sort: { reportedAt: -1 } },
    {
      $group: {
        _id: { hospitalId: '$hospitalId', resourceType: '$resourceType' },
        snapshot: { $first: '$$ROOT' }
      }
    }
  ]);

  const staleByHospital = new Map();
  for (const entry of snapshots) {
    const snapshot = entry.snapshot;
    if (snapshot.availableCount === null || snapshot.availableCount === undefined || snapshot.availableCount === 0) {
      continue;
    }
    const reportedAt = new Date(snapshot.reportedAt || snapshot.createdAt);
    if (!Number.isFinite(reportedAt.getTime())) {
      console.warn('[EmailNotification] Skipping resource snapshot with an invalid report timestamp.', {
        hospitalId: entry._id.hospitalId.toString(),
        resourceType: snapshot.resourceType
      });
      continue;
    }
    const ageMilliseconds = Math.max(0, now.getTime() - reportedAt.getTime());
    if (ageMilliseconds <= config.RESOURCE_STALE_AFTER * 60000) continue;
    const ageMinutes = Math.floor(ageMilliseconds / 60000);

    const hospitalId = entry._id.hospitalId.toString();
    const staleResources = staleByHospital.get(hospitalId) || [];
    staleResources.push({ resourceType: snapshot.resourceType, ageMinutes });
    staleByHospital.set(hospitalId, staleResources);
  }

  if (!staleByHospital.size) return { hospitalsChecked: 0, remindersSent: 0 };

  const hospitals = await Hospital.find({
    _id: { $in: [...staleByHospital.keys()] },
    status: { $ne: 'closed' }
  }).lean();
  let remindersSent = 0;

  for (const hospital of hospitals) {
    const hospitalId = hospital._id;
    let claimed = false;
    try {
      claimed = await claimHospitalReminder(hospitalId, now);
      if (!claimed) continue;

      const recipients = await User.find({
        hospitalId,
        role: { $in: ['hospital_staff', 'hospital_admin'] },
        accountStatus: 'active'
      }).select('name email');

      if (!recipients.length) {
        await releaseHospitalReminder(hospitalId);
        console.warn('[EmailNotification] Stale resources found, but no active hospital staff recipients exist.', {
          hospitalId: hospitalId.toString()
        });
        continue;
      }

      for (const recipient of recipients) {
        await emailService.sendStaleResourceReminder({
          recipient,
          hospitalName: hospital.name,
          staleResources: staleByHospital.get(hospitalId.toString()),
          staleAfterMinutes: config.RESOURCE_STALE_AFTER
        });
        remindersSent += 1;
      }

      await finishHospitalReminder(hospitalId, now);
    } catch (error) {
      if (claimed) {
        await releaseHospitalReminder(hospitalId);
      }
      console.error('[EmailNotification] Failed to send stale-resource reminder.', {
        hospitalId: hospitalId.toString(),
        error: error.message
      });
    }
  }

  return { hospitalsChecked: staleByHospital.size, remindersSent };
}

function startResourceReminderScheduler() {
  if (!config.RESOURCE_REMINDERS_ENABLED) {
    return null;
  }
  if (!config.SMTP_HOST || !config.SMTP_FROM) {
    console.error('[EmailNotification] Resource reminders are enabled, but SMTP_HOST or SMTP_FROM is missing.');
    return null;
  }

  const interval = config.RESOURCE_REMINDER_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    runResourceReminderCheck().catch((error) => {
      console.error('[EmailNotification] Resource reminder check failed.', { error: error.message });
    });
  }, interval);
  timer.unref();
  console.log(`Resource reminder email check scheduled every ${config.RESOURCE_REMINDER_INTERVAL_MINUTES} minutes.`);
  return timer;
}

module.exports = {
  runResourceReminderCheck,
  startResourceReminderScheduler
};
