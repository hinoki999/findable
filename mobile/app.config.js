require('dotenv').config();

module.exports = {
  expo: {
    ...require('./app.json').expo,
    extra: {
      ...require('./app.json').expo?.extra,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
    },
  },
};
