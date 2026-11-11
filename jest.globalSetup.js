// Runs once before any test worker starts; the workers inherit the env.
//
// Pin a timezone WITH daylight saving, so date code is tested where DST and
// midnight bugs can show up. CI runners default to UTC, which has neither, so
// a DST bug would pass there silently. app/utils/__tests__/pet.test.js asserts
// this pin is active.
module.exports = () => {
  process.env.TZ = 'America/New_York';
};
