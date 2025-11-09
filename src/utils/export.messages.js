/**
 * GetExportSuccessMessage returns human-readable success message for export completion.
 * Message indicates email delivery without exposing download URL in chat.
 * Supports English and French languages as required by v3 specification.
 * @param {string} lang - Language code en or fr.
 * @returns {string} - Localized success message for export completion.
 */
function GetExportSuccessMessage(lang) {
  // *************** Validate lang parameter
  if (!lang) {
    return "Done. I've sent the file to your email.";
  }

  // *************** Return French message for fr language
  if (lang === 'fr') {
    return "C'est fait. J'ai envoyé le fichier à votre e-mail.";
  }

  // *************** Return English message as default
  return "Done. I've sent the file to your email.";
}

/**
 * GetExportFailureMessage returns human-readable failure message for export errors.
 * Provides actionable guidance based on error type and language.
 * Never exposes technical details or says unexpected error.
 * @param {string} errorType - Type of error validation or runtime.
 * @param {string} lang - Language code en or fr.
 * @param {object} details - Optional error details for specific messages.
 * @returns {string} - Localized actionable failure message.
 */
function GetExportFailureMessage(errorType, lang, details = {}) {
  // *************** Validate lang parameter default to en
  const effectiveLang = lang === 'fr' ? 'fr' : 'en';

  // *************** Handle missing columns error
  if (errorType === 'missing_columns') {
    if (effectiveLang === 'fr') {
      return 'Quelles colonnes souhaitez-vous exporter ? Par exemple : first_name, last_name, email.';
    }
    return 'Which columns do you want to export? For example: first_name, last_name, email.';
  }

  // *************** Handle unknown columns error
  if (errorType === 'unknown_columns') {
    const unknownList = details.unknownColumns ? details.unknownColumns.join(', ') : '';
    const validExamples = details.validExamples ? details.validExamples.join(', ') : 'first_name, last_name, email';

    if (effectiveLang === 'fr') {
      return `Je ne trouve pas ces colonnes : ${unknownList}. Les options valides incluent : ${validExamples}.`;
    }
    return `I can't find these columns: ${unknownList}. Valid options include: ${validExamples}.`;
  }

  // *************** Handle missing filters error
  if (errorType === 'missing_filters') {
    if (effectiveLang === 'fr') {
      return 'Quelle condition dois-je utiliser ? Par exemple : status = active.';
    }
    return 'Which condition should I use? For example: status = active.';
  }

  // *************** Handle invalid delimiter error
  if (errorType === 'invalid_delimiter') {
    if (effectiveLang === 'fr') {
      return 'Je ne supporte que comma, semicolon ou tab. Lequel dois-je utiliser ?';
    }
    return 'I only support comma, semicolon, or tab. Which one should I use?';
  }

  // *************** Handle invalid filter error
  if (errorType === 'invalid_filter') {
    const fieldName = details.fieldName || 'field';
    const suggestions = details.suggestions || '';

    if (effectiveLang === 'fr') {
      return `Je ne reconnais pas le filtre "${fieldName}". ${suggestions}`;
    }
    return `I don't recognize the filter "${fieldName}". ${suggestions}`;
  }

  // *************** Handle type mismatch error
  if (errorType === 'type_mismatch') {
    const fieldName = details.fieldName || 'field';

    if (effectiveLang === 'fr') {
      return `La valeur pour "${fieldName}" ne correspond pas à son type. Veuillez l'ajuster.`;
    }
    return `The value for "${fieldName}" doesn't match its type. Please adjust it.`;
  }

  // *************** Handle runtime errors S3 email streaming
  if (errorType === 'runtime_error') {
    if (effectiveLang === 'fr') {
      return "Désolé, je n'ai pas pu générer le fichier cette fois. Réessayez dans un instant.";
    }
    return "Sorry, I couldn't generate the file this time. Please try again in a moment.";
  }

  // *************** Default fallback for unknown error types
  if (effectiveLang === 'fr') {
    return "Une erreur s'est produite. Veuillez réessayer.";
  }
  return 'An error occurred. Please try again.';
}

// *************** EXPORT MODULE ***************
module.exports = {
  GetExportSuccessMessage,
  GetExportFailureMessage,
};
