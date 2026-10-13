const config = require('../../src/config/env');
const Hospital = require('../../src/models/Hospital');
const ResourceSnapshot = require('../../src/models/ResourceSnapshot');
const ResourceReminder = require('../../src/models/ResourceReminder');
const User = require('../../src/models/User');
const emailService = require('../../src/services/email.service');
const { runResourceReminderCheck } = require('../../src/services/resource-reminder.service');

jest.mock('../../src/models/Hospital');
jest.mock('../../src/models/ResourceSnapshot');
jest.mock('../../src/models/ResourceReminder');
jest.mock('../../src/models/User');
jest.mock('../../src/services/email.service', () => ({
  sendStaleResourceReminder: jest.fn().mockResolvedValue({ messageId: 'reminder-1' })
}));

describe('resource reminder scheduler service', () => {
  const hospitalId = 'hospital-1';
  const now = new Date('2026-10-14T00:00:00.000Z');
  let reminderRecord;

  beforeEach(() => {
    jest.clearAllMocks();
    config.RESOURCE_STALE_AFTER = 120;
    config.RESOURCE_REMINDER_REPEAT_HOURS = 24;

    reminderRecord = null;
    ResourceSnapshot.aggregate.mockResolvedValue([
      {
        _id: { hospitalId, resourceType: 'icu_bed' },
        snapshot: {
          hospitalId,
          resourceType: 'icu_bed',
          availableCount: 2,
          reportedAt: new Date(now.getTime() - 135 * 60 * 1000)
        }
      },
      {
        _id: { hospitalId, resourceType: 'ventilator' },
        snapshot: {
          hospitalId,
          resourceType: 'ventilator',
          availableCount: 0,
          reportedAt: new Date(now.getTime() - 200 * 60 * 1000)
        }
      }
    ]);
    Hospital.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: hospitalId, name: 'City Care Hospital' }])
    });
    User.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ name: 'Hospital staff', email: 'staff@example.test' }])
    });
    ResourceReminder.findOne.mockImplementation(async () => reminderRecord);
    ResourceReminder.create.mockImplementation(async (data) => {
      reminderRecord = { _id: 'reminder-state-1', lastSentAt: null, ...data };
      return reminderRecord;
    });
    ResourceReminder.findOneAndUpdate.mockImplementation(async (_query, update) => {
      Object.assign(reminderRecord, update.$set);
      return reminderRecord;
    });
    ResourceReminder.updateOne.mockImplementation(async (_query, update) => {
      if (update.$set) Object.assign(reminderRecord, update.$set);
      if (update.$unset) {
        for (const key of Object.keys(update.$unset)) delete reminderRecord[key];
      }
      return { acknowledged: true };
    });
  });

  test('emails active hospital staff for stale resources and suppresses another reminder for 24 hours', async () => {
    const result = await runResourceReminderCheck(now);

    expect(result).toEqual({ hospitalsChecked: 1, remindersSent: 1 });
    expect(emailService.sendStaleResourceReminder).toHaveBeenCalledWith({
      recipient: { name: 'Hospital staff', email: 'staff@example.test' },
      hospitalName: 'City Care Hospital',
      staleResources: [{ resourceType: 'icu_bed', ageMinutes: 135 }],
      staleAfterMinutes: 120
    });
    expect(reminderRecord.lastSentAt).toEqual(now);
    expect(reminderRecord.lockUntil).toBeUndefined();

    emailService.sendStaleResourceReminder.mockClear();
    const nextResult = await runResourceReminderCheck(new Date(now.getTime() + 60 * 60 * 1000));

    expect(nextResult).toEqual({ hospitalsChecked: 1, remindersSent: 0 });
    expect(emailService.sendStaleResourceReminder).not.toHaveBeenCalled();
  });
});
