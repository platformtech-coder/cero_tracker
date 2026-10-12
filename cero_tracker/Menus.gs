/**
 * @file Menus.gs
 * @description Google Sheets Menu system for CERO Tracker.
 */

/* eslint-disable no-unused-vars */

/**
 * Creates the custom menu when the spreadsheet opens.
 * This should be the only simple trigger in the project.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(CONFIG.MENU_NAME)
    .addItem('Sync Contacts Now', 'syncContacts')
    .addItem('Install Daily Trigger', 'setupTriggers')
    .addItem('Install Form Triggers', 'installFormTriggers')
    .addItem('Capture Form Schema', 'captureOrientationFormSchema')
    .addItem('Setup Tracker Sheets', 'setupTracker')
    .addToUi();
}

/**
 * Entry point for setting up sheets manually.
 */
function setupTracker() {
  setupSheets();
  SpreadsheetApp.getUi().alert('Tracker sheets setup complete.');
}
