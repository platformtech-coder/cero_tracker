/**
 * @file TriggerManager.gs
 * @description Manages installable triggers for the project.
 */

/* eslint-disable no-unused-vars */

/**
 * Asserts that the active user is authorized to manage triggers.
 * Anyone with edit access to this spreadsheet can install/remove triggers.
 * @throws {Error} If the active user cannot be identified
 */
function _assertAuthorizedUser() {
  const activeUser = Session.getActiveUser().getEmail();
  if (!activeUser) {
    throw new Error('Cannot identify the current user. Ensure you are logged into Google.');
  }
}

/**
 * Creates a time-based daily trigger for the given handler function.
 * Deletes any existing trigger for the same handler before creating.
 * @param {string} handlerFunctionName
 * @param {number} atHour - Hour of day (0–23) in script timezone
 */
function _createDailyTrigger(handlerFunctionName, atHour) {
  // Remove all existing triggers for this handler
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handlerFunctionName)
    .forEach(t => ScriptApp.deleteTrigger(t));

  // Create the new trigger
  ScriptApp.newTrigger(handlerFunctionName)
    .timeBased()
    .everyDays(1)
    .atHour(atHour)
    .create();
}

/**
 * Sets up the daily sync trigger.
 */
function setupTriggers() {
  _assertAuthorizedUser();
  _createDailyTrigger('runDailySync', CONFIG.TRIGGER_HOUR);
  SpreadsheetApp.getActiveSpreadsheet()
    .toast(`Daily trigger set for ${CONFIG.TRIGGER_HOUR}:00 AM`, CONFIG.MENU_NAME, 5);
}

/**
 * Sets up form-submit triggers for RC and Orientation forms,
 * and the daily time-based trigger to refresh Orientation form dates.
 */
function installFormTriggers() {
  _assertAuthorizedUser();
  const props = PropertiesService.getScriptProperties();
  const rcFormId = props.getProperty('RC_FORM_ID');
  const orientationFormId = props.getProperty('ORIENTATION_FORM_ID');
  
  const ui = SpreadsheetApp.getUi();
  if (!rcFormId || !orientationFormId) {
    ui.alert('Missing Form IDs', 
             'Please add RC_FORM_ID and ORIENTATION_FORM_ID to Project Settings > Script Properties before installing triggers.', 
             ui.ButtonSet.OK);
    return;
  }
  
  // Clean up any existing form triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    const handler = t.getHandlerFunction();
    if (handler === 'onRCFormSubmit' || handler === 'onOrientationFormSubmit') {
      ScriptApp.deleteTrigger(t);
    }
  });

  try {
    const rcForm = FormApp.openById(rcFormId);
    ScriptApp.newTrigger('onRCFormSubmit')
      .forForm(rcForm)
      .onFormSubmit()
      .create();
      
    const orientationForm = FormApp.openById(orientationFormId);
    ScriptApp.newTrigger('onOrientationFormSubmit')
      .forForm(orientationForm)
      .onFormSubmit()
      .create();
      
    // Create the daily trigger for refreshing dynamic dates
    _createDailyTrigger('refreshOrientationFormDates', CONFIG.ORIENTATION_DATE_REFRESH_HOUR);

    ui.alert('Success', 'Form triggers and daily date-refresh trigger installed successfully.', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Error installing triggers', err.message, ui.ButtonSet.OK);
  }
}

/**
 * Removes all triggers for the project.
 */
function removeAllTriggers() {
  _assertAuthorizedUser();
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Remove All Triggers',
    'This will delete all project triggers. This cannot be undone.',
    ui.ButtonSet.OK_CANCEL);
  if (response !== ui.Button.OK) return;
  
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ui.alert('All triggers removed.');
}
