/**
 * @file User.js
 * @description Mongoose model for system users in EmergencyLink with role-based access control.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, ACCOUNT_STATUSES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please provide a valid email address'
      ]
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false
    },
    role: {
      type: String,
      enum: {
        values: ROLES,
        message: '{VALUE} is not a valid role'
      },
      required: [true, 'Role is required']
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
      validate: {
        validator: function (val) {
          if (['hospital_staff', 'hospital_admin'].includes(this.role)) {
            return val !== null && val !== undefined;
          }
          return true;
        },
        message: 'hospitalId is required for hospital_staff and hospital_admin roles'
      }
    },
    ambulanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ambulance',
      default: null,
      validate: {
        validator: function (val) {
          if (this.role === 'ambulance_staff') {
            return val !== null && val !== undefined;
          }
          return true;
        },
        message: 'ambulanceId is required for ambulance_staff role'
      }
    },
    accountStatus: {
      type: String,
      enum: {
        values: ACCOUNT_STATUSES,
        message: '{VALUE} is not a valid account status'
      },
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

// Virtual field for raw password setter
userSchema
  .virtual('password')
  .set(function (plainPassword) {
    this._plainPassword = plainPassword;
    this.passwordHash = plainPassword;
  })
  .get(function () {
    return this._plainPassword;
  });

/**
 * Pre-save middleware: hash password with bcryptjs (cost 12) if modified.
 */
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) {
    return;
  }

  // Avoid re-hashing if it is already an existing bcrypt hash
  const isAlreadyBcryptHash =
    typeof this.passwordHash === 'string' &&
    /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.passwordHash);

  if (isAlreadyBcryptHash) {
    return;
  }

  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

/**
 * Instance method to compare candidate password with stored hash.
 * @param {string} candidate - Plaintext password to verify
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidate) {
  if (!this.passwordHash) {
    throw new Error(
      'passwordHash is not selected in current query. Call select("+passwordHash") before comparing passwords.'
    );
  }
  return bcrypt.compare(candidate, this.passwordHash);
};

// Transform output JSON and Object to never expose passwordHash and __v
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

userSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
