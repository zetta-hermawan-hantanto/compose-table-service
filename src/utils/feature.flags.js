/**
 * IsBilipV2Enabled checks if BILIP v2 features should be active.
 * Reads BILIP_V2_ENABLED environment variable with safe default to false.
 * Used to conditionally register v2 routes and enable conversational table features.
 * @returns {boolean} - True if v2 is enabled false otherwise.
 */
function IsBilipV2Enabled() {
  // *************** Read environment variable with default false
  const flagValue = process.env.BILIP_V2_ENABLED;

  if (!flagValue) {
    return false;
  }

  // *************** Parse boolean from string safely
  const isEnabled = flagValue.toLowerCase() === 'true' || flagValue === '1';

  return isEnabled;
}

// *************** EXPORT MODULE ***************
module.exports = { IsBilipV2Enabled };
